# Mergington High School Activities

A small FastAPI application for browsing and joining extracurricular activities,
built as part of the **Getting Started with GitHub Copilot** exercise. The frontend
uses plain HTML, CSS, and JavaScript; no frontend build step is required.

This README is the main guide for running, using, and developing the project.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Using the app](#using-the-app)
- [API reference](#api-reference)
- [Data and limitations](#data-and-limitations)
- [Development and tests](#development-and-tests)
- [Troubleshooting](#troubleshooting)
- [GitHub Copilot exercise](#github-copilot-exercise)
- [License](#license)

## Features

- Nine seeded activities: Chess Club, Programming Class, Gym Class, Soccer Club,
  Basketball Club, Art Club, Drama Club, Math Club, and Science Club.
- A pink, purple, and teal school-themed interface with an introductory guide
  and an activity-card grid that adapts to desktops, tablets, and phones.
- Expandable participant lists, participant counts, and remaining spots.
- Inline **Join**, **Confirm**, and **Cancel** controls on each activity card.
  Students enter a username; the form adds `@mergington.edu` automatically.
- Server-side school-email validation, duplicate-signup rejection, and capacity
  enforcement.
- Participant lists and availability refresh after successful signup without
  replacing other cards or clearing their in-progress forms.
- Card-level success and error messages, retry support, and controls disabled
  while a signup request is pending.
- A keyboard skip link, visible focus indicators, labeled form controls,
  focus management, and live status messages.

## Quick start

### Local setup

Use Python with `pip` and virtual-environment support. Python 3.13 matches the
provided [development container](.devcontainer/devcontainer.json). Node.js 18 or
newer is needed only for the frontend tests.

Run these commands from the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn src.app:app --reload
```

On Windows PowerShell, replace the activation command with:

```powershell
.\.venv\Scripts\Activate.ps1
```

Open:

| Page | URL |
| --- | --- |
| Activities website | http://localhost:8000/ |
| Interactive API docs (Swagger UI) | http://localhost:8000/docs |
| Alternative API docs (ReDoc) | http://localhost:8000/redoc |
| OpenAPI schema | http://localhost:8000/openapi.json |

Stop the server with `Ctrl+C`. Reloading or restarting the server resets signups.
Running `python src/app.py` alone does not start an HTTP server; use Uvicorn.

### VS Code or GitHub Codespaces

Open the repository in a Codespace or choose **Dev Containers: Reopen in
Container** in VS Code. The container installs
[requirements-dev.txt](requirements-dev.txt), including pytest, and forwards port 8000.

In **Run and Debug**, select **Launch Mergington WebApp** and start debugging,
or run the Uvicorn command above in the terminal. The
[debug configuration](.vscode/launch.json) also watches static files for reload.
In Codespaces, open port 8000 from the **Ports** panel.

## Using the app

1. Browse the activity cards and check schedules and remaining spots.
2. Expand **View participants** to see registered email addresses.
3. Select **Join**, enter only your school username (for example, `alex`), and
   select **Confirm**. Use only ASCII letters, digits, dots, underscores, plus
   signs, or hyphens. Do not enter the full email address or any whitespace.
4. A successful signup closes and clears that form, displays a confirmation, and
   refreshes participant lists and availability.

**Cancel** closes the form without submitting and preserves the typed username
if you reopen it. Failed requests keep the form input for retry. If signup
succeeds but refreshing availability fails, the card explicitly says you are
signed up and asks you to reload; do not submit again.

Cards with no remaining spots show a disabled **Full** button. The API also
rejects signups for full activities, including when another student takes the
last spot after you load the page. That error appears on the activity card;
reload the page to update availability.

## API reference

The website and API are served by the same FastAPI application. No authentication
is required. Interactive request and response schemas are available at `/docs`.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/` | Redirects to `/static/index.html` (HTTP 307). |
| `GET` | `/activities` | Returns all activities keyed by their exact names. |
| `POST` | `/activities/{activity_name}/signup` | Registers the required `email` query parameter. |

### List activities

```bash
curl http://localhost:8000/activities
```

Each entry contains `description`, `schedule`, `max_participants`, and
`participants` (an array of email addresses). For example, the initial Chess Club
entry is:

```json
{
  "Chess Club": {
    "description": "Learn strategies and compete in chess tournaments",
    "schedule": "Fridays, 3:30 PM - 5:00 PM",
    "max_participants": 12,
    "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
  }
}
```

Participant counts and remaining spots are calculated by the frontend, not
returned as separate API fields.

### Sign up

URL-encode activity names and email addresses. The email is a query parameter,
not a JSON request body:

```bash
curl -X POST \
  'http://localhost:8000/activities/Chess%20Club/signup?email=alex%40mergington.edu'
```

Successful response (HTTP 200):

```json
{"message": "Signed up alex@mergington.edu for Chess Club"}
```

Email validation requires a non-empty local part containing only ASCII letters,
digits, dots, underscores, plus signs, or hyphens, and exactly the domain
`mergington.edu` (case-insensitive).
Other domains and subdomains are rejected. Addresses are stored as supplied;
duplicate detection compares the entire email string case-insensitively within
the selected activity.

| Status | Condition | Response detail |
| --- | --- | --- |
| `400` | Invalid school email | `Please use a valid @mergington.edu student email address.` |
| `400` | Email already registered for this activity (case-insensitive) | `Student already signed up for this activity` |
| `400` | Activity has reached or exceeded capacity | `Activity is full` |
| `404` | Unknown activity name | `Activity not found` |
| `422` | Missing required `email` query parameter | FastAPI validation error list |

Errors use a JSON `detail` field. Unknown activity names are checked before
email-format validation.

## Data and limitations

- Activities are defined in the in-memory `activities` dictionary in
  [src/app.py](src/app.py). Activity names are identifiers; participants are email
  strings. There is no separate student profile, name, or grade-level model.
- Data resets to the seeded values on process restart or development-server
  reload. Multiple server workers do not share signup state.
- The API enforces `max_participants`, with signup checks and insertion protected
  against concurrent requests within one process. This does not provide shared
  capacity management across multiple server workers.
- There is no authentication or school-email ownership verification. Participant
  emails are visible to anyone who can access the application.
- There is no database persistence, cancellation endpoint, or activity-management
  API. Edit the seed dictionary to change activities during development.

This is an educational demo, not a production registration system. Use sample
addresses rather than real student data.

## Development and tests

### Project layout

| Path | Purpose |
| --- | --- |
| [src/app.py](src/app.py) | FastAPI routes, validation, and seeded activity data |
| [src/static/](src/static/) | Website markup, styles, and browser behavior |
| [tests/test_signup.py](tests/test_signup.py) | API signup regression tests |
| [tests/test_activity_join.cjs](tests/test_activity_join.cjs) | Frontend interaction tests using Node's built-in test runner |
| [requirements.txt](requirements.txt) | Python runtime and API-test dependencies |
| [requirements-dev.txt](requirements-dev.txt) | Runtime dependencies plus pytest for development |
| [pytest.ini](pytest.ini) | Pytest test discovery and project import path |
| [.vscode/settings.json](.vscode/settings.json) | VS Code pytest discovery configuration |
| [.vscode/launch.json](.vscode/launch.json) | VS Code Uvicorn debugger configuration |
| [.devcontainer/devcontainer.json](.devcontainer/devcontainer.json) | Codespaces and local container setup |
| [.github/steps/](.github/steps/) | Copilot exercise instructions |
| [.github/workflows/](.github/workflows/) | Exercise progression and grading automation |

Install the development dependencies in your activated Python environment,
then run both test suites from the repository root:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -v
node --test tests/test_activity_join.cjs
```

The [pytest configuration](pytest.ini) discovers tests in `tests` and adds the
repository root to the Python import path.

### Running and debugging tests in VS Code

Install the **Python** extension by Microsoft (already included in the development
container). Run **Python: Select Interpreter** from the Command Palette and choose
the environment where you installed the development dependencies.

The workspace enables pytest and discovers Python tests in `tests`. Open the
**Testing** panel (flask icon) and select **Refresh Tests** if needed. Use **Run
Tests** to execute the suite, or the controls beside an individual test to run it.
Set a breakpoint and choose **Debug Test** to step through a test.

The existing Python tests use `unittest` and run unchanged under pytest; they can
also still be run with `python -m unittest discover -s tests -v`. The JavaScript
suite remains separate and uses the Node command above.

### Test coverage and isolation

Neither command needs a running server. Python tests use FastAPI's `TestClient`
and restore activity state between tests. Frontend tests use a lightweight
simulated DOM and mocked requests; no npm installation is required.

The Python suite covers activity listing (including an empty collection), the
homepage redirect, missing and invalid school emails, successful signup and its
visibility in listings, isolation between activities, duplicate rejection,
unknown activities, full and over-capacity activities, and concurrent requests
for the last available spot. Edge cases cover concurrent duplicate signups,
case-only duplicates, allowed and disallowed username characters, whitespace,
URL-encoded activity names, error precedence, email supplied only in a JSON body,
and unsupported signup methods. Frontend coverage includes username validation, inline forms,
participant refresh, preserved input, failed requests, pending submissions, and
full and empty states. These are not real-browser layout or accessibility tests.

When contributing, keep changes focused and add regression tests for behavior
changes. Run both suites and manually check the website on narrow and wide
screens, keyboard navigation, participant expansion, signup, cancel, and error
feedback when changing the UI. Update this guide when commands, API behavior,
or limitations change.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `No module named uvicorn`, `fastapi`, or `httpx` | Activate the virtual environment and run `python -m pip install -r requirements.txt` using the same interpreter as the server/tests. |
| Uvicorn cannot import `src.app` | Run the documented command from the repository root. |
| Port 8000 is already in use | Add `--port 8001` to the Uvicorn command and use that port in the browser. |
| Page says activities failed to load | Start FastAPI and open its website URL, not the HTML file directly. Check the browser console and server terminal for errors. |
| Signup is rejected | Check that the activity has space. Enter only a username in the UI; API clients must supply a full `@mergington.edu` address that is not already registered for that activity. |
| Signups disappeared | The server restarted or reloaded; in-memory data is intentionally reset. |
| CSS or JavaScript edits do not appear | Reload the browser; if needed, perform a hard refresh. |

## GitHub Copilot exercise

This repository retains its original self-paced GitHub Skills exercise:

- [Open the exercise issue](https://github.com/lnezsierra/skills-getting-started-with-github-copilot-ing/issues/1)
- Follow the instructions in [.github/steps/](.github/steps/), starting with
  [step 1](.github/steps/1-step.md).
- Exercise workflows guide progression; they are not a replacement for running
  the application regression tests above. Some exercise prompts ask you to add
  tooling such as `pytest`; the current tests can run with `unittest` as shown.

## License

[MIT License](LICENSE), copyright GitHub and others.
See also the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md)
linked by the original exercise.
