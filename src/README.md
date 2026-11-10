# Mergington High School Activities API

A super simple FastAPI application that allows students to view and sign up for extracurricular activities.

## Features

- View all available extracurricular activities
- Teal-and-pink school styling, a multi-column activity grid on wide screens,
  and a sticky desktop signup panel keep browsing and registration together.
- Search activities by name, description, or schedule, with matching counts
  and a clear empty state. Join highlights the selected card and keeps the
  signup form synchronized; keyboard focus and status announcements are supported.
- Sign up for activities
- Enter just your school username in the form; the fixed `@mergington.edu` suffix is added automatically.
- Registration requires a valid `@mergington.edu` email address, enforced by the form and API (domain matching is case-insensitive).
- Activity cards highlight schedules and show text-based availability badges:
  remaining spots, "Almost full" when at most 20% of capacity remains, or "Full".
- Participant sections show a count and start collapsed. Open the Participants
  dropdown with a click or keyboard to see the bulleted list or empty-state message.
- Signup shows "Signing up..." and blocks repeat submissions while a request is pending.
- Signup confirmations and errors stay visible until dismissed or a new signup attempt begins.
- Choose an activity with its Join button, which focuses the username field.
  The signup form displays the selected activity without a redundant dropdown
  and requires a selection before signup. Successful signup clears the selection.
- Full activities have disabled Join buttons and cannot be submitted. The API also
  rejects signups once capacity is reached, including simultaneous requests for
  the last spot within the running application process.

## Getting Started

1. Install the dependencies:

   ```
   pip install -r requirements.txt
   ```

   Run this command from the repository root.

2. Run the application:

   ```
   python app.py
   ```

3. Open your browser and go to:
   - API documentation: http://localhost:8000/docs
   - Alternative documentation: http://localhost:8000/redoc

## API Endpoints

| Method | Endpoint                                                          | Description                                                         |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/activities`                                                     | Get all activities with their details and current participant count |
| POST   | `/activities/{activity_name}/signup?email=student@mergington.edu` | Sign up for an activity                                             |

Signup rejects other domains with HTTP 400 and malformed email addresses with
HTTP 422. Full activities return HTTP 409; the form refreshes availability when
another signup has taken the last spot. Domain validation does not verify
ownership of the email address.

## Tests

From the repository root, run:

```
python -m unittest discover -s tests -v
```

With Node.js installed, run the UI behavior tests from the repository root:

```
node tests/test_ui.js
```

## Data Model

The application uses a simple data model with meaningful identifiers:

1. **Activities** - Uses activity name as identifier:

   - Description
   - Schedule
   - Maximum number of participants allowed
   - List of student emails who are signed up

2. **Students** - Uses email as identifier:
   - Name
   - Grade level

All data is stored in memory, which means data will be reset when the server restarts.
