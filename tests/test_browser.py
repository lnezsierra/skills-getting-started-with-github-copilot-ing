from copy import deepcopy
import socket
from threading import Thread
import time

from playwright.sync_api import Page, expect
import pytest
import uvicorn

from src.app import activities, app


@pytest.fixture
def live_server():
    original = deepcopy(activities)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
        thread = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 10
            while not server.started:
                if not thread.is_alive() or time.monotonic() >= deadline:
                    pytest.fail("Browser test server failed to start")
                time.sleep(0.01)
            yield f"http://127.0.0.1:{port}"
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            activities.clear()
            activities.update(original)
            if thread.is_alive():
                pytest.fail("Browser test server failed to stop")


def test_signup_in_browser(page: Page, live_server: str):
    page.goto(live_server)
    page.get_by_role("button", name="Join Chess Club", exact=True).click()
    page.get_by_label("School username").fill("browser+club")
    with page.expect_response(
        lambda response: "/signup?" in response.url and response.request.method == "POST"
    ) as signup:
        page.get_by_role("button", name="Sign Up", exact=True).click()
    assert signup.value.status == 200
    expect(page.locator("#message-text")).to_have_text(
        "Signed up browser+club@mergington.edu for Chess Club"
    )
    expect(page.get_by_label("School username")).to_have_value("")
    expect(page.locator("#signup-button")).to_be_disabled()
    card = page.locator(".activity-card").filter(
        has=page.get_by_role("heading", name="Chess Club", exact=True)
    )
    expect(card.locator("summary")).to_have_text("Participants (3)")
    card.locator("summary").click()
    expect(card.get_by_text("browser+club@mergington.edu", exact=True)).to_be_visible()
    catalog = page.request.get(f"{live_server}/activities")
    assert catalog.status == 200
    assert catalog.json()["Chess Club"]["participants"].count(
        "browser+club@mergington.edu"
    ) == 1


@pytest.mark.parametrize("username", ["", "student name", "student@gmail.com", "student@mergington.edu"])
def test_browser_validation_blocks_invalid_username(page: Page, live_server: str, username: str):
    requests = []
    page.on("request", lambda request: requests.append(request))
    page.goto(live_server)
    page.get_by_role("button", name="Join Chess Club", exact=True).click()
    field = page.get_by_label("School username")
    field.fill(username)
    page.get_by_role("button", name="Sign Up", exact=True).click()
    assert field.evaluate("(element) => !element.validity.valid")
    assert page.locator("#signup-form").evaluate("(form) => !form.checkValidity()")
    assert not any(request.method == "POST" for request in requests)
    assert activities["Chess Club"]["participants"] == [
        "michael@mergington.edu", "daniel@mergington.edu"
    ]
