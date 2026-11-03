import unittest
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier
from unittest.mock import patch
from urllib.parse import quote

from fastapi.testclient import TestClient

from src.app import activities, app


class SignupTests(unittest.TestCase):
    def setUp(self):
        activity_patch = patch.dict(activities, deepcopy(activities), clear=True)
        activity_patch.start()
        self.addCleanup(activity_patch.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_lists_activities_with_details(self):
        expected_activities = deepcopy(activities)
        response = self.client.get("/activities")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected_activities)
        self.assertTrue(response.json())
        for activity in response.json().values():
            self.assertEqual(
                set(activity),
                {"description", "schedule", "max_participants", "participants"},
            )
            self.assertIsInstance(activity["description"], str)
            self.assertIsInstance(activity["schedule"], str)
            self.assertIsInstance(activity["max_participants"], int)
            self.assertIsInstance(activity["participants"], list)

    def test_rejects_missing_email_without_changes(self):
        original_activities = deepcopy(activities)
        response = self.client.post("/activities/Chess Club/signup")

        self.assertEqual(response.status_code, 422)
        self.assertTrue(
            any(
                error["loc"] == ["query", "email"]
                and error["type"] == "missing"
                for error in response.json()["detail"]
            )
        )
        self.assertEqual(activities, original_activities)

    def test_root_redirects_to_homepage(self):
        response = self.client.get("/", follow_redirects=False)

        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["location"], "/static/index.html")

    def test_signup_appears_once_in_activity_listing(self):
        email = "new.student@mergington.edu"
        original_participants = activities["Chess Club"]["participants"].copy()
        response = self.client.post(
            "/activities/Chess Club/signup", params={"email": email}
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.get("/activities")
        self.assertEqual(response.status_code, 200)
        participants = response.json()["Chess Club"]["participants"]
        self.assertEqual(participants, original_participants + [email])
        self.assertEqual(participants.count(email), 1)

    def test_signup_does_not_change_other_activities(self):
        original_others = deepcopy(
            {name: activity for name, activity in activities.items()
             if name != "Chess Club"}
        )
        response = self.client.post(
            "/activities/Chess Club/signup",
            params={"email": "new.student@mergington.edu"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "new.student@mergington.edu", activities["Chess Club"]["participants"]
        )
        self.assertEqual(
            {name: activity for name, activity in activities.items()
             if name != "Chess Club"},
            original_others,
        )

    def test_lists_empty_activity_collection(self):
        activities.clear()
        response = self.client.get("/activities")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {})

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

    def test_concurrent_duplicate_signups_register_once(self):
        original_activities = deepcopy(activities)
        for emails in (
            ["new.student@mergington.edu"] * 8,
            ["New.Student@MERGINGTON.EDU", "new.student@mergington.edu"] * 4,
        ):
            with self.subTest(emails=emails):
                with patch.dict(activities, deepcopy(original_activities), clear=True):
                    original_participants = activities["Chess Club"]["participants"].copy()
                    barrier = Barrier(8, timeout=10)

                    def signup(email):
                        with TestClient(app) as client:
                            barrier.wait()
                            return client.post(
                                "/activities/Chess Club/signup",
                                params={"email": email},
                            )

                    with ThreadPoolExecutor(max_workers=8) as executor:
                        responses = list(executor.map(signup, emails))

                    self.assertEqual(
                        sorted(response.status_code for response in responses),
                        [200] + [400] * 7,
                    )
                    for response in responses:
                        if response.status_code == 400:
                            self.assertEqual(
                                response.json()["detail"],
                                "Student already signed up for this activity",
                            )
                    participants = activities["Chess Club"]["participants"]
                    self.assertEqual(participants[:-1], original_participants)
                    self.assertEqual(
                        sum(email.lower() == emails[0].lower() for email in participants),
                        1,
                    )

    def test_rejects_case_only_duplicate_emails(self):
        for first, duplicate in (
            ("New.Student@MERGINGTON.EDU", "new.student@mergington.edu"),
            ("another@mergington.edu", "ANOTHER@MERGINGTON.EDU"),
        ):
            with self.subTest(first=first, duplicate=duplicate):
                response = self.client.post(
                    "/activities/Chess Club/signup", params={"email": first}
                )
                self.assertEqual(response.status_code, 200)
                self.assertIn(first, activities["Chess Club"]["participants"])
                original_activities = deepcopy(activities)
                response = self.client.post(
                    "/activities/Chess Club/signup", params={"email": duplicate}
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.json()["detail"],
                    "Student already signed up for this activity",
                )
                self.assertEqual(activities, original_activities)

    def test_rejects_whitespace_without_changes(self):
        original_activities = deepcopy(activities)
        for email in (
            " student@mergington.edu",
            "student@mergington.edu ",
            "\tstudent@mergington.edu",
            "student@mergington.edu\t",
            "stu\ndent@mergington.edu",
            "student@mergington.edu\r\n",
            "student\u00a0@mergington.edu",
        ):
            with self.subTest(email=email):
                response = self.client.post(
                    "/activities/Chess Club/signup", params={"email": email}
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("mergington.edu", response.json()["detail"])
                self.assertEqual(activities, original_activities)

    def test_accepts_allowed_username_characters(self):
        for username in (
            "Student123", "first.last", "student_name",
            "student+club", "student-name", "._+-",
        ):
            with self.subTest(username=username):
                email = f"{username}@mergington.edu"
                response = self.client.post(
                    "/activities/Chess Club/signup", params={"email": email}
                )
                self.assertEqual(response.status_code, 200)
                self.assertIn(email, activities["Chess Club"]["participants"])

    def test_rejects_disallowed_username_characters_without_changes(self):
        original_activities = deepcopy(activities)
        for username in (
            "jos\u00e9", "student!", "student/name", "student\\name",
            '"student"', "student:club", "student[club]", "student%club",
        ):
            with self.subTest(username=username):
                response = self.client.post(
                    "/activities/Chess Club/signup",
                    params={"email": f"{username}@mergington.edu"},
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("mergington.edu", response.json()["detail"])
                self.assertEqual(activities, original_activities)

    def test_signup_with_url_encoded_activity_names(self):
        for name in ("Chess Club", "Arts & Crafts", "Caf\u00e9 Club"):
            with self.subTest(name=name):
                activities[name] = {
                    **deepcopy(activities["Chess Club"]),
                    "participants": [],
                }
                original_activities = deepcopy(activities)
                email = "student+club@mergington.edu"
                response = self.client.post(
                    f"/activities/{quote(name, safe='')}/signup",
                    params={"email": email},
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    response.json(), {"message": f"Signed up {email} for {name}"}
                )
                original_activities[name]["participants"].append(email)
                self.assertEqual(activities, original_activities)

    def test_unknown_activity_takes_precedence_over_invalid_email(self):
        original_activities = deepcopy(activities)
        response = self.client.post(
            "/activities/Unknown/signup", params={"email": "invalid"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Activity not found"})
        self.assertEqual(activities, original_activities)

    def test_json_body_does_not_replace_required_email_query(self):
        original_activities = deepcopy(activities)
        response = self.client.post(
            "/activities/Chess Club/signup",
            json={"email": "new.student@mergington.edu"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertTrue(
            any(
                error["loc"] == ["query", "email"] and error["type"] == "missing"
                for error in response.json()["detail"]
            )
        )
        self.assertEqual(activities, original_activities)

    def test_get_signup_is_not_allowed_and_does_not_change_activities(self):
        original_activities = deepcopy(activities)
        response = self.client.get(
            "/activities/Chess Club/signup",
            params={"email": "new.student@mergington.edu"},
        )
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json(), {"detail": "Method Not Allowed"})
        self.assertIn("POST", response.headers["allow"])
        self.assertEqual(activities, original_activities)


if __name__ == "__main__":
    unittest.main()
