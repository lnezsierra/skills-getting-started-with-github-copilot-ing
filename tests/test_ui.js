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

  const submit = () => ids["signup-form"].submit({ preventDefault() {} });
  ids.username.value = "student+club";
  ids.activity.value = "Available";
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
  console.log("PASS: availability badges, loading and repeat-submit protection, refresh, persistent messages, dismissal, and error recovery");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
