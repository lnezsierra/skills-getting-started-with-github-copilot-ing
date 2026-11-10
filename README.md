# Mergington High School Activities

A web application for browsing and joining extracurricular activities at
Mergington High School. Built with FastAPI and a plain HTML, CSS, and JavaScript
frontend served by the same application.

## Features

- Browse activity descriptions, schedules, participant lists, and available spots.
- Search by activity name, description, or schedule.
- See availability badges, including "Almost full" when at most 20% of capacity
  remains, and disabled Join buttons for full activities.
- Select an activity with its Join button, then enter a school username;
  the form adds `@mergington.edu` automatically.
- Receive dismissible signup confirmations and errors, with repeat submissions
  blocked while a request is pending.
- Use a responsive activity grid, a sticky desktop signup panel, keyboard-friendly
  controls, and status announcements.

## Run locally

You need Python with pip. Node.js is optional and is only needed for the UI tests.

Run these commands from the repository root.

1. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

   On Windows PowerShell, activate it with `.venv\Scripts\Activate.ps1` instead.

2. Install dependencies:

   ```bash
   python -m pip install -r requirements.txt
   ```

3. Start the development server:

   ```bash
   python -m uvicorn src.app:app --reload
   ```

4. Open the application at <http://localhost:8000>.

Interactive API documentation is available at <http://localhost:8000/docs>,
with an alternative view at <http://localhost:8000/redoc>.
In a Codespace, open forwarded port **8000** in your browser.

## Using the app

1. Browse or search for an activity.
2. Expand **Participants** to view registered email addresses.
3. Click **Join** to select an activity and focus the username field.
4. Enter your school username and click **Sign Up**.

After a successful signup, the app refreshes the activity list and clears the
selection. If another signup takes the last spot, the app reports the error and
refreshes availability.

## API

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/` | Redirect to the web interface. |
| GET | `/activities` | Return activities keyed by name, including descriptions, schedules, capacities, and participant email lists. |
| POST | `/activities/{activity_name}/signup?email=student@mergington.edu` | Register a student for an activity. |

Use the exact activity name and URL-encode spaces when calling the API directly:

```bash
curl -X POST \
  'http://localhost:8000/activities/Chess%20Club/signup?email=student%40mergington.edu'
```

A successful request returns HTTP 200:

```json
{"message": "Signed up student@mergington.edu for Chess Club"}
```

Signup errors:

| Status | Meaning |
| ------ | ------- |
| 400 | Email is outside `@mergington.edu`, or the email is already registered for the activity. |
| 404 | Activity does not exist. |
| 409 | Activity has reached capacity. |
| 422 | Email is missing or malformed. |

## Tests

Install the development dependencies (including the application dependencies and
pytest and Playwright), install Chromium, then run the API and browser tests:

```bash
python -m pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium
python -m pytest -v
```

The existing `unittest.TestCase` tests run unchanged under pytest. Test discovery
is configured in [pytest.ini](pytest.ini).
Browser tests start an isolated local server on a free port and restore activity
data after each test. To run only API tests without installing a browser, use
`python -m pytest tests/test_signup.py -v`.

### VS Code

1. Install the recommended **Python** and **Python Debugger** extensions.
2. Run **Python: Select Interpreter** from the Command Palette and choose the
   environment where you installed the development dependencies, such as `.venv`.
3. Open the **Testing** panel and refresh discovery if needed. Use **Run Tests**
   or **Debug Tests** for the suite or an individual test.

Workspace settings enable pytest, disable duplicate unittest discovery, and
refresh discovery when test files are saved. New or rebuilt dev containers
install the development dependencies automatically; in an existing container,
run the install commands above. Install Chromium with the command above before
running browser tests in a new container.

### JavaScript UI tests

The dev container includes Node.js for the UI tests. Rebuild an existing
container to install it, or install Node.js locally, then run:

```bash
node tests/test_ui.js
```

Both commands run from the repository root.
The JavaScript tests run separately and are not discovered by pytest.

## Project layout

- [src/app.py](src/app.py): FastAPI application, initial activity data, and signup validation.
- [src/static/](src/static/): Web interface, styles, and browser-side behavior.
- [tests/](tests/): Python API tests and JavaScript UI behavior tests.
- [requirements.txt](requirements.txt): Python dependencies.

## Data and limitations

Activities are identified by name and contain a description, schedule, maximum
participant count, and a list of registered email addresses. There are no separate
student profiles.

- Data is stored in memory and resets to the initial catalog when the server
  restarts, including development reloads.
- Signup checks and updates are synchronized within one application process.
  Separate worker processes do not share data or locks; use a single worker for
  this in-memory version.
- School-domain matching is case-insensitive, but it does not verify email
  ownership. The app has no authentication, and participant email lists are
  visible to anyone who can access it.

This is a demo application, not a production student registration system.

## License

See [LICENSE](LICENSE).
