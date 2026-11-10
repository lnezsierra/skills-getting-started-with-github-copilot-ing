from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
import re
from threading import Barrier
import unittest

from fastapi.testclient import TestClient

from src.app import activities, app


class SignupTests(unittest.TestCase):
    def setUp(self):
        self.original_activities = deepcopy(activities)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.addCleanup(self.restore_activities)

    def restore_activities(self):
        activities.clear()
        activities.update(self.original_activities)

    def signup(self, email, activity="Chess Club"):
        return self.client.post(
            f"/activities/{activity}/signup", params={"email": email}
        )

    def test_activity_catalog_contract(self):
        response = self.client.get("/activities")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.original_activities)
        for details in response.json().values():
            self.assertEqual(
                set(details),
                {"description", "schedule", "max_participants", "participants"},
            )
            self.assertIsInstance(details["description"], str)
            self.assertIsInstance(details["schedule"], str)
            self.assertIsInstance(details["max_participants"], int)
            self.assertIsInstance(details["participants"], list)
            self.assertTrue(all(isinstance(email, str) for email in details["participants"]))

    def test_signup_is_visible_in_catalog_and_does_not_change_other_activities(self):
        email = "newstudent@mergington.edu"
        self.assertEqual(self.signup(email).status_code, 200)
        expected = deepcopy(self.original_activities)
        expected["Chess Club"]["participants"].append(email)
        response = self.client.get("/activities")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected)

    def test_root_redirect_and_frontend_assets(self):
        response = self.client.get("/", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["location"], "/static/index.html")
        for path, content_type, expected in [
            ("/static/index.html", "text/html", 'id="signup-form"'),
            ("/static/app.js", "javascript", "DOMContentLoaded"),
            ("/static/styles.css", "text/css", ".activity-card"),
        ]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(content_type, response.headers["content-type"])
                self.assertIn(expected, response.text)

    def test_missing_email_does_not_change_participants(self):
        response = self.client.post("/activities/Chess%20Club/signup")
        self.assertEqual(response.status_code, 422)
        self.assertTrue(any(
            error["loc"] == ["query", "email"] and error["type"] == "missing"
            for error in response.json()["detail"]
        ))
        self.assertEqual(activities, self.original_activities)

    def test_accepts_school_email_and_normalizes_domain(self):
        for email, expected in [
            ("student@mergington.edu", "student@mergington.edu"),
            ("another@MERGINGTON.EDU", "another@mergington.edu"),
            ("student+club@Mergington.Edu", "student+club@mergington.edu"),
        ]:
            with self.subTest(email=email):
                response = self.signup(email)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    response.json(),
                    {"message": f"Signed up {expected} for Chess Club"},
                )
                self.assertIn(expected, activities["Chess Club"]["participants"])

    def test_rejects_other_domains_without_changing_participants(self):
        for email in [
            "student@gmail.com",
            "student@mergington.edu.example.com",
            "student@sub.mergington.edu",
            "student@notmergington.edu",
        ]:
            with self.subTest(email=email):
                response = self.signup(email)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.json(),
                    {"detail": "Use your @mergington.edu school email address"},
                )
                self.assertEqual(activities, self.original_activities)

    def test_rejects_malformed_emails(self):
        for email in [
            "",
            "mergington.edu",
            "@mergington.edu",
            "student@@mergington.edu",
            "student@mergingtonxedu",
            "student name@mergington.edu",
            "student..name@mergington.edu",
            ".student@mergington.edu",
            "student@mergington.edu\n.attacker.com",
        ]:
            with self.subTest(email=email):
                self.assertEqual(self.signup(email).status_code, 422)
                self.assertEqual(activities, self.original_activities)

    def test_duplicate_signup_still_rejected(self):
        response = self.signup("michael@MERGINGTON.EDU")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"], "Student already signed up for this activity"
        )
        self.assertEqual(activities, self.original_activities)

    def test_unknown_activity_still_rejected(self):
        self.assertEqual(
            self.signup("student@mergington.edu", "Unknown Club").status_code, 404
        )
        self.assertEqual(activities, self.original_activities)

    def test_full_and_over_capacity_activities_reject_signup(self):
        activity = activities["Chess Club"]
        for capacity in [len(activity["participants"]), 1, 0]:
            with self.subTest(capacity=capacity):
                activity["max_participants"] = capacity
                before = deepcopy(activities)
                response = self.signup("newstudent@mergington.edu")
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json(), {"detail": "Activity is full"})
                self.assertEqual(activities, before)

    def test_last_spot_can_only_be_taken_once(self):
        activity = activities["Chess Club"]
        activity["max_participants"] = len(activity["participants"]) + 1
        response = self.signup("laststudent@mergington.edu")
        self.assertEqual(response.status_code, 200)
        before = deepcopy(activities)
        response = self.signup("nextstudent@mergington.edu")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(activities, before)

    def test_concurrent_signups_cannot_exceed_capacity(self):
        activity = activities["Chess Club"]
        activity["max_participants"] = len(activity["participants"]) + 1
        with ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(
                self.signup,
                [f"student{i}@mergington.edu" for i in range(8)],
            ))
        self.assertEqual(sum(response.status_code == 200 for response in responses), 1)
        self.assertEqual(sum(response.status_code == 409 for response in responses), 7)
        self.assertEqual(len(activity["participants"]), activity["max_participants"])

    def test_duplicate_signup_on_full_activity_keeps_existing_error(self):
        activity = activities["Chess Club"]
        activity["max_participants"] = len(activity["participants"])
        response = self.signup("michael@mergington.edu")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"], "Student already signed up for this activity"
        )

    def test_concurrent_duplicate_signups_register_only_once(self):
        barrier = Barrier(8)
        email = "samestudent@mergington.edu"

        def signup_together(_):
            barrier.wait(timeout=10)
            return self.signup(email)

        with ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(signup_together, range(8)))

        self.assertEqual(sum(response.status_code == 200 for response in responses), 1)
        self.assertEqual(sum(response.status_code == 400 for response in responses), 7)
        for response in responses:
            if response.status_code == 400:
                self.assertEqual(
                    response.json(),
                    {"detail": "Student already signed up for this activity"},
                )
        expected = deepcopy(self.original_activities)
        expected["Chess Club"]["participants"].append(email)
        self.assertEqual(activities, expected)

    def test_form_accepts_only_username_with_fixed_school_domain(self):
        class EmailInputParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.username_input = None
                self.reading_domain = False
                self.domain = ""

            def handle_starttag(self, tag, attrs):
                attributes = dict(attrs)
                if tag == "input" and attributes.get("id") == "username":
                    self.username_input = attributes
                if tag == "span" and attributes.get("id") == "email-domain":
                    self.reading_domain = True

            def handle_data(self, data):
                if self.reading_domain:
                    self.domain += data

            def handle_endtag(self, tag):
                if tag == "span":
                    self.reading_domain = False

        parser = EmailInputParser()
        parser.feed(
            (Path(__file__).parents[1] / "src/static/index.html").read_text()
        )
        attributes = parser.username_input
        self.assertIsNotNone(attributes)
        self.assertEqual(attributes["type"], "text")
        self.assertIn("required", attributes)
        self.assertIn("email-domain", attributes["aria-describedby"].split())
        self.assertEqual(parser.domain, "@mergington.edu")
        for username in ["student", "student.name", "student+club", "Student_1"]:
            self.assertIsNotNone(re.fullmatch(attributes["pattern"], username))
        for username in [
            "",
            "student name",
            "student\tname",
            "student@gmail.com",
            "student@mergington.edu",
            "@mergington.edu",
        ]:
            self.assertIsNone(re.fullmatch(attributes["pattern"], username))


if __name__ == "__main__":
    unittest.main()
