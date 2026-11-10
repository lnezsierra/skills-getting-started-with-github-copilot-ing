"""
Mergington High School extracurricular activities API.

Serves the web interface, lists activities, and accepts student signups.
Activity data is stored in memory and resets when the application restarts.
"""

# API framework, static file serving, redirects, and email validation.
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import EmailStr

# Filesystem utilities and thread synchronization for signup requests.
import os
from pathlib import Path
from threading import Lock

# Configure the API metadata displayed in the generated documentation.
app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Serialize signup validation and updates within this application process.
signup_lock = Lock()

# Serve frontend assets from the static directory beside this module.
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

# In-memory activity catalog containing descriptions, schedules, and signups.
# Each activity defines a participant limit and a list of registered emails.
# Changes are not persisted or shared between separate worker processes.
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
        "description": "Practice soccer skills and compete in friendly matches",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 22,
        "participants": []
    },
    "Basketball Club": {
        "description": "Develop basketball skills and teamwork through games",
        "schedule": "Mondays and Wednesdays, 3:30 PM - 5:00 PM",
        "max_participants": 20,
        "participants": []
    },
    "Art Club": {
        "description": "Explore drawing, painting, and other visual arts",
        "schedule": "Wednesdays, 3:30 PM - 5:00 PM",
        "max_participants": 18,
        "participants": []
    },
    "Drama Club": {
        "description": "Develop acting skills and perform in school productions",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 25,
        "participants": []
    },
    "Debate Club": {
        "description": "Build critical thinking and public speaking skills through debates",
        "schedule": "Mondays, 3:30 PM - 4:30 PM",
        "max_participants": 16,
        "participants": []
    },
    "Math Club": {
        "description": "Solve challenging math problems and prepare for competitions",
        "schedule": "Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": []
    }
}


# Frontend entry point.
@app.get("/")
def root():
    """Redirect visitors to the activity signup web interface."""
    return RedirectResponse(url="/static/index.html")


# Activity discovery endpoint.
@app.get("/activities")
def get_activities():
    """Return all activities with schedules, capacities, and participant lists."""
    return activities


# Student registration endpoint.
@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: EmailStr):
    """Register a school email address for an activity with available space.

    Args:
        activity_name: Exact name of an activity in the catalog.
        email: Student email address, validated by Pydantic's EmailStr.

    Returns:
        A confirmation message identifying the student and activity.

    Raises:
        HTTPException: 404 for an unknown activity, 400 for a non-school
            email or duplicate signup, or 409 when the activity is full.
    """
    # Reject unknown activity names before accessing the catalog entry.
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # EmailStr validates syntax; this check restricts signups to the school domain.
    if email.rsplit("@", 1)[1].lower() != "mergington.edu":
        raise HTTPException(status_code=400, detail="Use your @mergington.edu school email address")

    # Retrieve the shared activity record to validate and update its signups.
    activity = activities[activity_name]

    # Keep duplicate checks, capacity checks, and insertion atomic across threads.
    with signup_lock:
        # Reject repeat registration using the same stored email address.
        if email in activity["participants"]:
            raise HTTPException(status_code=400, detail="Student already signed up for this activity")

        # Reject registration when the activity has reached its participant limit.
        if len(activity["participants"]) >= activity["max_participants"]:
            raise HTTPException(status_code=409, detail="Activity is full")

        # Record the signup only after all validation checks succeed.
        activity["participants"].append(email)

    # Confirm successful registration to the caller.
    return {"message": f"Signed up {email} for {activity_name}"}
