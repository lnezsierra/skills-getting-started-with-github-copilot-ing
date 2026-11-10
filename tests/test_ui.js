const { readFileSync } = require("node:fs");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.className = "";
    this.value = "";
    this.disabled = false;
    this.classList = {
      add: (name) => {
        this.className = [...new Set([...this.className.split(" "), name])].join(" ");
      },
      contains: (name) => this.className.split(" ").includes(name),
    };
  }

  set innerHTML(value) {
    this.html = value;
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
  }

  addEventListener(event, callback) {
    this[event] = callback;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  focus() {
    this.focused = true;
  }
}

async function settle() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

async function run() {
  const ids = {};
  [
    "activities-list", "signup-form", "message", "message-text",
    "signup-button", "dismiss-message", "username", "selected-activity",
    "activity-search", "activity-count", "activities-empty",
  ].forEach((id) => {
    ids[id] = new Element();
  });
  ids["signup-form"].reset = () => {
    ids.username.value = "";
  };
  const document = {
    getElementById: (id) => ids[id],
    createElement: (tag) => new Element(tag),
    addEventListener: (event, callback) => callback(),
  };
  const activities = {};
  for (const [name, capacity, count] of [
    ["Available", 10, 7], ["Limited", 10, 8], ["Last spot", 10, 9],
    ["Full", 10, 10], ["Over capacity", 10, 11], ["Zero capacity", 0, 0],
  ]) {
    activities[name] = {
      description: "Activity description",
      schedule: "Fridays",
      max_participants: capacity,
      participants: Array.from({ length: count }, (_, i) => `student${i}@mergington.edu`),
    };
  }
  let postCount = 0;
  let pending;
  let lastUrl;
  const fetch = async (url, options) => {
    if (!options) {
      return { ok: true, json: async () => activities };
    }
    postCount++;
    lastUrl = url;
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
    });
  };
  const errors = [];
  const source = readFileSync("src/static/app.js", "utf8");
  const html = readFileSync("src/static/index.html", "utf8");
  assert(!/<select\b/.test(html), "Activity dropdown is removed");
  assert(html.includes('id="selected-activity"'), "Form shows selected activity");
  new Function("document", "fetch", "console", "setTimeout", source)(
    document, fetch, { error: (...args) => errors.push(args) },
    () => { throw new Error("Messages must not expire on a timer"); }
  );
  await settle();
  const submit = () => ids["signup-form"].submit({ preventDefault() {} });
  assert(ids["signup-button"].disabled, "Require a Join selection before signup");
  assert(ids["selected-activity"].textContent.includes("Choose an activity"), "Explain how to select an activity");
  await submit();
  assert(postCount === 0, "Do not submit without an activity");
  assert(ids["message-text"].textContent.includes("Join button"), "Explain missing selection");
  ids["dismiss-message"].click();
  assert(ids.username.focused, "Dismiss focuses username when signup is disabled");
  const cards = ids["activities-list"].children;
  assert(ids["activity-count"].textContent === "6 activities found", "Show activity count");
  assert(ids["activities-empty"].hidden, "Hide empty state when activities exist");
  ids["activity-search"].value = "  AVAILABLE  ";
  ids["activity-search"].input();
  assert(!cards[0].hidden && cards.slice(1).every((card) => card.hidden), "Search by name ignores case and surrounding spaces");
  assert(ids["activity-count"].textContent === "1 activity found", "Singular search result count");
  ids["activity-search"].value = "Fridays";
  ids["activity-search"].input();
  assert(cards.every((card) => !card.hidden), "Search by schedule");
  ids["activity-search"].value = "Activity description";
  ids["activity-search"].input();
  assert(cards.every((card) => !card.hidden), "Search by description");
  ids["activity-search"].value = "No matching activity";
  ids["activity-search"].input();
  assert(cards.every((card) => card.hidden) && !ids["activities-empty"].hidden, "Explain no search matches");
  assert(ids["activity-count"].textContent === "0 activities found", "Zero result count");
  ids["activity-search"].value = "";
  ids["activity-search"].input();
  assert(cards.every((card) => !card.hidden) && ids["activities-empty"].hidden, "Clearing search restores cards");
  assert(cards[0].html.includes("availability-available\">3 spots left"), "Normal availability badge");
  assert(cards[1].html.includes("Almost full - 2 spots left"), "20% threshold is almost full");
  assert(cards[2].html.includes("Almost full - 1 spot left"), "Singular spot label");
  for (const card of cards.slice(3)) {
    assert(card.html.includes("availability-full\">Full"), "Full badge at or above capacity");
    assert(!card.html.includes("-1 spots"), "Never show negative availability");
  }
  assert(cards[0].html.includes('class="activity-schedule"'), "Highlighted schedule");
  assert(cards[0].children[0].className === "participants", "Separate participant section");
  for (const card of cards) {
    const participants = card.children[0];
    assert(participants.tag === "details", "Use native expandable participant dropdown");
    assert(!participants.open && !("open" in participants.attributes), "Participant lists start collapsed");
    assert(participants.children[0].tag === "summary", "Dropdown has a keyboard-accessible summary");
  }
  const participants = cards[0].children[0];
  assert(participants.children[0].textContent === "Participants (7)", "Show participant count before opening");
  assert(participants.children[1].tag === "ul", "Keep participants in a bulleted list inside dropdown");
  assert(participants.children[1].children.length === 7, "Include every participant inside dropdown");
  assert(participants.children[1].children[0].textContent === "student0@mergington.edu", "Render participant email as text");
  const emptyParticipants = cards[5].children[0];
  assert(emptyParticipants.children[0].textContent === "Participants (0)", "Show zero participant count");
  assert(emptyParticipants.children[1].textContent === "No participants yet.", "Keep empty state inside collapsed dropdown");
  const joinButton = cards[0].children[1];
  assert(joinButton.textContent === "Join" && !joinButton.disabled, "Available activity has Join button");
  assert(joinButton.attributes["aria-label"] === "Join Available", "Join button identifies activity");
  joinButton.click();
  assert(cards[0].attributes["data-selected"] === "true", "Highlight selected card");
  assert(joinButton.attributes["aria-pressed"] === "true", "Announce selected Join button");
  assert(ids["selected-activity"].textContent === "Selected activity: Available", "Join displays selected activity");
  assert(ids.username.focused, "Join focuses username");
  cards[1].children[1].click();
  assert(cards[0].attributes["data-selected"] === "false", "Remove previous selection highlight");
  assert(joinButton.attributes["aria-pressed"] === "false", "Clear previous pressed state");
  assert(ids["selected-activity"].textContent === "Selected activity: Limited", "Another Join replaces selection");
  joinButton.click();
  for (const card of cards.slice(3)) {
    assert(card.children[1].disabled && card.children[1].textContent === "Full", "Full activities have disabled Join buttons");
  }
  ids.username.value = "student+club";
  assert(!ids["signup-button"].disabled, "Selecting available activity restores signup");
  const submission = submit();
  assert(ids["signup-button"].disabled, "Disable signup while pending");
  assert(ids["signup-button"].textContent === "Signing up...", "Loading label");
  assert(ids["signup-form"].attributes["aria-busy"] === "true", "Accessible busy state");
  assert(cards.every((card) => card.children[1].disabled), "Do not switch activities during signup");
  await submit();
  assert(postCount === 1, "Ignore repeat submissions");
  assert(lastUrl.includes("student%2Bclub%40mergington.edu"), "Keep fixed domain and URL encoding");
  assert(lastUrl.includes("/activities/Available/signup"), "Submit the activity chosen by Join");
  activities.Available.participants.push("student+club@mergington.edu");
  pending.resolve({ ok: true, json: async () => ({ message: "Signup confirmed" }) });
  await submission;
  assert(ids.message.className === "message success", "Persistent success message");
  assert(ids["message-text"].textContent === "Signup confirmed", "Success text");
  assert(ids["signup-button"].disabled, "Require new selection after success");
  assert(ids["signup-button"].textContent === "Sign Up", "Restore button label");
  assert(!("aria-busy" in ids["signup-form"].attributes), "Clear busy state");
  assert(ids.username.value === "", "Reset form after success");
  assert(ids["activities-list"].children[0].html.includes("Almost full - 2 spots left"), "Refresh badge after signup");
  assert(ids["activities-list"].children[0].children[0].children[0].textContent === "Participants (8)", "Refresh participant dropdown count after signup");
  assert(ids["selected-activity"].textContent.includes("Choose an activity"), "Clear selected activity after success");
  await settle();
  assert(!ids.message.classList.contains("hidden"), "Success stays visible");
  ids["dismiss-message"].click();
  assert(ids.message.classList.contains("hidden"), "Dismiss hides message");
  assert(ids.username.focused, "Dismiss restores focus");
  ids["activities-list"].children[0].children[1].click();

  for (const detail of ["Already signed up", [{ msg: "Invalid email address" }]]) {
    ids.username.value = "student";
    const attempt = submit();
    pending.resolve({ ok: false, json: async () => ({ detail }) });
    await attempt;
    assert(ids.message.className === "message error", "Persistent API error");
    assert(ids["message-text"].textContent === (Array.isArray(detail) ? detail[0].msg : detail), "Readable API error");
    assert(ids.username.value === "student", "Keep input after error");
    assert(!ids["signup-button"].disabled, "Restore button after API error");
  }
  for (const response of [
    () => pending.reject(new Error("Network unavailable")),
    () => pending.resolve({ ok: true, json: async () => { throw new Error("Invalid JSON"); } }),
  ]) {
    const attempt = submit();
    response();
    await attempt;
    assert(ids.message.className === "message error", "Persistent request error");
    assert(ids["message-text"].textContent === "Failed to sign up. Please try again.", "Readable request error");
    assert(!ids["signup-button"].disabled, "Restore button after request failure");
  }
  assert(errors.length === 2, "Log request failures");

  ids["activities-list"].children[2].children[1].click();
  const lastSpotSignup = submit();
  activities["Last spot"].participants.push("last@mergington.edu");
  pending.resolve({ ok: true, json: async () => ({ message: "Last spot confirmed" }) });
  await lastSpotSignup;
  assert(ids["activities-list"].children[2].children[1].disabled, "Last spot signup disables card Join");
  assert(ids["signup-button"].disabled, "Signup stays disabled until another activity is chosen");
  assert(ids.message.className === "message success", "Keep last-spot confirmation visible");

  ids["activities-list"].children[1].children[1].click();
  const staleSignup = submit();
  activities.Limited.participants.push("other1@mergington.edu", "other2@mergington.edu");
  pending.resolve({ ok: false, status: 409, json: async () => ({ detail: "Activity is full" }) });
  await staleSignup;
  assert(ids["message-text"].textContent === "Activity is full", "Show server capacity error");
  assert(ids["selected-activity"].textContent === "Selected activity: Limited (Full)", "Preserve and explain full selection after refresh");
  assert(ids["signup-button"].disabled, "Server capacity conflict disables signup after refresh");
  assert(ids["activities-list"].children[1].children[1].disabled, "Server capacity conflict refreshes Join button");
  const countBeforeBlockedSignup = postCount;
  await submit();
  assert(postCount === countBeforeBlockedSignup, "Full selection cannot submit even programmatically");
  assert(ids["message-text"].textContent.includes("Activity is full"), "Explain blocked full signup");
  ids["activities-list"].children[0].children[1].click();
  assert(!ids["signup-button"].disabled, "Join another activity recovers from full state");
  assert(ids["selected-activity"].textContent === "Selected activity: Available" && ids.username.focused, "Join still selects and focuses after refresh");
  console.log("PASS: activity search and empty states, selected-card feedback, Join focus, full-activity controls, capacity refresh, repeat-submit protection, persistent messages, and error recovery");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
