# Mergington High School Activities API

A super simple FastAPI application that allows students to view and sign up for extracurricular activities.

## Features

- View all available extracurricular activities
- Expand "View participants" on an activity to see its signed-up students
- Sign up for activities using a @mergington.edu school email address
- Choose "Join" to reveal a username field and "Confirm" button directly on the activity card; cancel to return to browsing
- Enter just your school username in the signup form; the fixed @mergington.edu suffix is added automatically
- Participant lists and availability refresh automatically after signing up
- Signup confirmations and errors stay visible on the relevant card; full activities cannot be joined

## Getting Started

1. Install the dependencies:

   ```
   pip install fastapi uvicorn
   ```

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

Signup requires a non-empty student email at exactly `mergington.edu`
(case-insensitive). Other domains, including subdomains, return HTTP 400 without
registering the student.

## Tests

Run the signup regression tests with:

```
python -m unittest discover -s tests -v
```

Run the activity-card interaction tests with Node.js 18 or newer:

```
node --test tests/test_activity_join.cjs
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
