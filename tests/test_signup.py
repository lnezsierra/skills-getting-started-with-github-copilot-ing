from copy import deepcopy
from html.parser import HTMLParser
from pathlib import Path
import re
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
