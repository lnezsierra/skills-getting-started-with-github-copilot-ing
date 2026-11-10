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

    def test_form_requires_exact_school_domain(self):
        class EmailInputParser(HTMLParser):
            def handle_starttag(self, tag, attrs):
                attributes = dict(attrs)
                if tag == "input" and attributes.get("id") == "email":
                    self.email_input = attributes

        parser = EmailInputParser()
        parser.feed(
            (Path(__file__).parents[1] / "src/static/index.html").read_text()
        )
        attributes = parser.email_input
        self.assertEqual(attributes["type"], "email")
        self.assertIn("required", attributes)
        self.assertIn("@mergington.edu", attributes["title"])
        for email in ["student@mergington.edu", "student@MERGINGTON.EDU"]:
            self.assertIsNotNone(re.fullmatch(attributes["pattern"], email))
        for email in [
            "student@gmail.com",
            "student@mergington.edu.example.com",
            "student@sub.mergington.edu",
            "student@mergingtonxedu",
            "student@@mergington.edu",
            "@mergington.edu",
        ]:
            self.assertIsNone(re.fullmatch(attributes["pattern"], email))


if __name__ == "__main__":
    unittest.main()
