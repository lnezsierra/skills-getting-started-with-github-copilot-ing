import unittest
from copy import deepcopy
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.app import activities, app


class SignupTests(unittest.TestCase):
    def setUp(self):
        activity_patch = patch.dict(activities, deepcopy(activities), clear=True)
        activity_patch.start()
        self.addCleanup(activity_patch.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_rejects_non_school_and_malformed_emails(self):
        original_participants = activities["Chess Club"]["participants"].copy()
        for email in (
            "student@gmail.com",
            "student@sub.mergington.edu",
            "student@mergington.edu.example.com",
            "student@notmergington.edu",
            "student@example.com@mergington.edu",
            "@mergington.edu",
            "student name@mergington.edu",
            "student@mergington.edu\n",
            "",
        ):
            with self.subTest(email=email):
                response = self.client.post(
                    "/activities/Chess Club/signup", params={"email": email}
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("mergington.edu", response.json()["detail"])
                self.assertEqual(
                    activities["Chess Club"]["participants"], original_participants
                )

    def test_accepts_school_email(self):
        for email in ("new.student@mergington.edu", "another@MERGINGTON.EDU"):
            with self.subTest(email=email):
                response = self.client.post(
                    "/activities/Chess Club/signup", params={"email": email}
                )
                self.assertEqual(response.status_code, 200)
                self.assertIn(email, activities["Chess Club"]["participants"])

    def test_duplicate_signup_still_rejected(self):
        response = self.client.post(
            "/activities/Chess Club/signup",
            params={"email": "michael@mergington.edu"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"], "Student already signed up for this activity"
        )

    def test_unknown_activity_still_rejected(self):
        response = self.client.post(
            "/activities/Unknown/signup", params={"email": "student@mergington.edu"}
        )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
