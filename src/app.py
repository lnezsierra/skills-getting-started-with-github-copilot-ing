"""Serve the Mergington High School activities website and signup API.

Activity data is kept in process memory for this educational demo; there is no
database persistence or student authentication.
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
import re
from pathlib import Path
from threading import Lock

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Resolve static assets relative to this module, not the working directory.
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

# Activity names are identifiers; participants are stored as email strings.
# Each server process has its own seed data, reset on restart or reload.
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Club": {
        "description": "Develop soccer skills and play team matches",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 22,
        "participants": []
    },
    "Basketball Club": {
        "description": "Practice basketball fundamentals and compete in games",
        "schedule": "Mondays and Wednesdays, 3:30 PM - 5:00 PM",
        "max_participants": 20,
        "participants": []
    },
    "Art Club": {
        "description": "Explore drawing, painting, and other visual arts",
        "schedule": "Wednesdays, 3:30 PM - 5:00 PM",
        "max_participants": 20,
        "participants": []
    },
    "Drama Club": {
        "description": "Learn acting techniques and perform in school productions",
        "schedule": "Tuesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 25,
        "participants": []
    },
    "Math Club": {
        "description": "Solve challenging problems and prepare for math competitions",
        "schedule": "Mondays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": []
    },
    "Science Club": {
        "description": "Conduct experiments and explore scientific discoveries",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 20,
        "participants": []
    }
}


signup_lock = Lock()


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    """Return activities keyed by name, including participant emails.

    The frontend derives participant counts and remaining spots from this data.
    """
    return activities


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: str):
    """Register the email query parameter for the named activity.

    Reject unknown activities, malformed school emails, case-insensitive
    duplicates, and full activities before modifying the participant list.
    """
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    local_part, _, domain = email.rpartition("@")
    if (
        domain.lower() != "mergington.edu"
        or re.fullmatch(r"[A-Za-z0-9._+-]+", local_part) is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Please use a valid @mergington.edu student email address.",
        )

    activity = activities[activity_name]

    # Keep validation and insertion atomic across concurrent signup requests.
    with signup_lock:
        if any(
            participant.lower() == email.lower()
            for participant in activity["participants"]
        ):
            raise HTTPException(status_code=400, detail="Student already signed up for this activity")

        if len(activity["participants"]) >= activity["max_participants"]:
            raise HTTPException(status_code=400, detail="Activity is full")

        activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}
