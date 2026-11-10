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
    this.options = [];
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
    if (this.tag === "select") {
      this.options.push(child);
    }
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
    "signup-button", "dismiss-message", "username",
  ].forEach((id) => {
    ids[id] = new Element();
  });
  ids.activity = new Element("select");
  ids.activity.options.push(new Element("option"));
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
  new Function("document", "fetch", "console", "setTimeout", source)(
    document, fetch, { error: (...args) => errors.push(args) },
    () => { throw new Error("Messages must not expire on a timer"); }
  );
  await settle();
  const cards = ids["activities-list"].children;
  assert(cards[0].html.includes("availability-available\">3 spots left"), "Normal availability badge");
  assert(cards[1].html.includes("Almost full - 2 spots left"), "20% threshold is almost full");
  assert(cards[2].html.includes("Almost full - 1 spot left"), "Singular spot label");
  for (const card of cards.slice(3)) {
    assert(card.html.includes("availability-full\">Full"), "Full badge at or above capacity");
    assert(!card.html.includes("-1 spots"), "Never show negative availability");
  }
  assert(cards[0].html.includes('class="activity-schedule"'), "Highlighted schedule");
  assert(cards[0].children[0].className === "participants", "Separate participant section");
  const joinButton = cards[0].children[1];
  assert(joinButton.textContent === "Join" && !joinButton.disabled, "Available activity has Join button");
  assert(joinButton.attributes["aria-label"] === "Join Available", "Join button identifies activity");
  joinButton.click();
  assert(ids.activity.value === "Available", "Join preselects activity");
  assert(ids.username.focused, "Join focuses username");
  for (const card of cards.slice(3)) {
    assert(card.children[1].disabled && card.children[1].textContent === "Full", "Full activities have disabled Join buttons");
  }
  for (const option of ids.activity.options.slice(4)) {
    assert(option.disabled && option.textContent.endsWith("(Full)"), "Full dropdown options are disabled and labeled");
  }

  const submit = () => ids["signup-form"].submit({ preventDefault() {} });
  ids.activity.value = "Full";
  ids.activity.change();
  assert(ids["signup-button"].disabled && ids["signup-button"].textContent === "Activity full", "Full selection disables signup");
  await submit();
  assert(postCount === 0, "Full selection cannot submit even programmatically");
  assert(ids["message-text"].textContent.includes("Activity is full"), "Explain blocked signup");
  ids["dismiss-message"].click();
  assert(ids.username.focused, "Dismiss focuses username when signup is disabled");
  ids.username.value = "student+club";
  ids.activity.value = "Available";
  ids.activity.change();
  assert(!ids["signup-button"].disabled, "Selecting available activity restores signup");
  const submission = submit();
  assert(ids["signup-button"].disabled, "Disable signup while pending");
  assert(ids["signup-button"].textContent === "Signing up...", "Loading label");
  assert(ids["signup-form"].attributes["aria-busy"] === "true", "Accessible busy state");
  await submit();
  assert(postCount === 1, "Ignore repeat submissions");
  assert(lastUrl.includes("student%2Bclub%40mergington.edu"), "Keep fixed domain and URL encoding");
  activities.Available.participants.push("student+club@mergington.edu");
  pending.resolve({ ok: true, json: async () => ({ message: "Signup confirmed" }) });
  await submission;
  assert(ids.message.className === "message success", "Persistent success message");
  assert(ids["message-text"].textContent === "Signup confirmed", "Success text");
  assert(!ids["signup-button"].disabled, "Restore signup button after success");
  assert(ids["signup-button"].textContent === "Sign Up", "Restore button label");
  assert(!("aria-busy" in ids["signup-form"].attributes), "Clear busy state");
  assert(ids.username.value === "", "Reset form after success");
  assert(ids["activities-list"].children[0].html.includes("Almost full - 2 spots left"), "Refresh badge after signup");
  assert(ids.activity.options.length === 7, "Do not duplicate activity options");
  await settle();
  assert(!ids.message.classList.contains("hidden"), "Success stays visible");
  ids["dismiss-message"].click();
  assert(ids.message.classList.contains("hidden"), "Dismiss hides message");
  assert(ids["signup-button"].focused, "Dismiss restores focus");

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

  ids.activity.value = "Last spot";
  ids.activity.change();
  const lastSpotSignup = submit();
  activities["Last spot"].participants.push("last@mergington.edu");
  pending.resolve({ ok: true, json: async () => ({ message: "Last spot confirmed" }) });
  await lastSpotSignup;
  assert(ids["activities-list"].children[2].children[1].disabled, "Last spot signup disables card Join");
  assert(ids.activity.options[3].disabled, "Last spot signup disables dropdown option");
  assert(ids["signup-button"].disabled, "Finally must not re-enable full selected activity");
  assert(ids.message.className === "message success", "Keep last-spot confirmation visible");

  ids.activity.value = "Limited";
  ids.activity.change();
  const staleSignup = submit();
  activities.Limited.participants.push("other1@mergington.edu", "other2@mergington.edu");
  pending.resolve({ ok: false, status: 409, json: async () => ({ detail: "Activity is full" }) });
  await staleSignup;
  assert(ids["message-text"].textContent === "Activity is full", "Show server capacity error");
  assert(ids.activity.value === "Limited", "Preserve selection when refreshing stale availability");
  assert(ids["signup-button"].disabled, "Server capacity conflict disables signup after refresh");
  assert(ids["activities-list"].children[1].children[1].disabled, "Server capacity conflict refreshes Join button");
  ids["activities-list"].children[0].children[1].click();
  assert(!ids["signup-button"].disabled, "Join another activity recovers from full state");
  assert(ids.activity.value === "Available" && ids.username.focused, "Join still preselects and focuses after refresh");
  console.log("PASS: Join selection and focus, full-activity controls, capacity refresh, availability badges, repeat-submit protection, persistent messages, and error recovery");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
