import unittest
from concurrent.futures import ThreadPoolExecutor
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

    def test_rejects_full_and_over_capacity_activities_without_changes(self):
        activity = activities["Chess Club"]
        original_participants = activity["participants"].copy()
        for capacity in (len(original_participants), len(original_participants) - 1, 0):
            with self.subTest(capacity=capacity):
                activity["max_participants"] = capacity
                response = self.client.post(
                    "/activities/Chess Club/signup",
                    params={"email": "new.student@mergington.edu"},
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["detail"], "Activity is full")
                self.assertEqual(activity["participants"], original_participants)

    def test_accepts_last_spot_then_rejects_next_signup(self):
        activity = activities["Chess Club"]
        activity["max_participants"] = len(activity["participants"]) + 1
        response = self.client.post(
            "/activities/Chess Club/signup",
            params={"email": "last.student@mergington.edu"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"message": "Signed up last.student@mergington.edu for Chess Club"},
        )
        participants = activity["participants"].copy()
        response = self.client.post(
            "/activities/Chess Club/signup",
            params={"email": "next.student@mergington.edu"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Activity is full")
        self.assertEqual(activity["participants"], participants)

    def test_duplicate_error_is_preserved_when_activity_is_full(self):
        activity = activities["Chess Club"]
        activity["max_participants"] = len(activity["participants"])
        self.test_duplicate_signup_still_rejected()

    def test_concurrent_signups_do_not_exceed_capacity(self):
        activity = activities["Chess Club"]
        activity["max_participants"] = len(activity["participants"]) + 1

        def signup(index):
            with TestClient(app) as client:
                return client.post(
                    "/activities/Chess Club/signup",
                    params={"email": f"student{index}@mergington.edu"},
                )

        with ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(signup, range(8)))

        self.assertEqual(
            sorted(response.status_code for response in responses),
            [200] + [400] * 7,
        )
        for response in responses:
            if response.status_code == 400:
                self.assertEqual(response.json()["detail"], "Activity is full")
        self.assertEqual(len(activity["participants"]), activity["max_participants"])


if __name__ == "__main__":
    unittest.main()
