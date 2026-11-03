const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const appScript = readFileSync(
  path.join(__dirname, "../src/static/app.js"),
  "utf8"
);

function createElement(tagName) {
  return {
    tagName,
    children: [],
    listeners: {},
    attributes: {},
    value: "",
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, callback) {
      this.listeners[name] = callback;
    },
    focus() {
      this.focused = true;
    },
    reportValidity() {
      return this.valid !== false;
    },
    reset() {
      find(this, "input").value = "";
    },
  };
}

function find(node, tag) {
  if (node.tagName === tag) return node;
  for (const child of node.children) {
    const match = find(child, tag);
    if (match) return match;
  }
}

function controls(card) {
  const form = find(card, "form");
  return {
    form,
    join: card.children.find((child) => child.tagName === "button"),
    username: find(form, "input"),
    confirm: find(form, "button"),
    cancel: form.children.at(-1).children[1],
    message: card.children.at(-1),
    availability: card.children[3],
  };
}

async function loadApp({ post, refreshFailure = false, initialFailure = false, empty = false, full = false } = {}) {
  const elements = {
    "activities-list": createElement("div"),
  };
  const requests = [];
  const errors = [];
  let initialize;
  const document = {
    createElement,
    getElementById: (id) => elements[id],
    addEventListener(name, callback) {
      if (name === "DOMContentLoaded") initialize = callback;
    },
  };
  const activities = empty ? {} : {
    "Chess Club": {
      description: "Play chess",
      schedule: "Monday",
      max_participants: full ? 1 : 10,
      participants: ["student@mergington.edu"],
    },
    "Arts & Crafts": {
      description: "Make art",
      schedule: "Tuesday",
      max_participants: 10,
      participants: [],
    },
  };
  vm.runInNewContext(appScript, {
    document,
    console: { error: (...args) => errors.push(args) },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options?.method === "POST") {
        if (post) return post(url);
        activities["Chess Club"].participants.push("new-student@mergington.edu");
        return { ok: true, json: async () => ({ message: "Registered" }) };
      }
      if (initialFailure || (refreshFailure && requests.length > 1)) {
        throw new Error("Offline");
      }
      return { ok: true, json: async () => activities };
    },
  });
  initialize();
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, requests, errors };
}

test("cards have collapsed participants and hidden, accessible inline signup forms", async () => {
  const { elements } = await loadApp();
  const cards = elements["activities-list"].children;
  assert.equal(cards.length, 2);
  cards.forEach((card) => {
    const { join, form, username, message } = controls(card);
    assert.equal(join.type, "button");
    assert.equal(join.textContent, "Join");
    assert.equal(join.attributes["aria-label"], `Join ${find(card, "h3").textContent}`);
    assert.equal(join.attributes["aria-controls"], form.id);
    assert.equal(form.hidden, true);
    assert.equal(username.required, true);
    assert.equal(username.pattern, "[^@\\s]+");
    assert.equal(find(form, "label").htmlFor, username.id);
    assert.equal(message.attributes["role"], "status");
    assert.equal(Boolean(find(card, "details").open), false);
  });
  assert.notEqual(controls(cards[0]).username.id, controls(cards[1]).username.id);
  assert.equal(find(cards[0], "li").textContent, "student@mergington.edu");
});

test("Join opens only its own form; Cancel closes it without losing typed input", async () => {
  const { elements, requests } = await loadApp();
  const first = controls(elements["activities-list"].children[0]);
  const second = controls(elements["activities-list"].children[1]);
  first.join.listeners.click();
  assert.equal(first.form.hidden, false);
  assert.equal(first.join.hidden, true);
  assert.equal(first.username.focused, true);
  assert.equal(first.join.attributes["aria-expanded"], "true");
  assert.equal(second.form.hidden, true);
  first.username.value = "existing-student";
  first.cancel.listeners.click();
  assert.equal(first.form.hidden, true);
  assert.equal(first.join.focused, true);
  first.join.listeners.click();
  assert.equal(first.username.value, "existing-student");
  assert.deepEqual(requests.map(({ url }) => url), ["/activities"]);
});

test("Confirm signs up inline and refreshes counts without replacing cards or other input", async () => {
  const { elements, requests } = await loadApp();
  const card = elements["activities-list"].children[0];
  const first = controls(card);
  const second = controls(elements["activities-list"].children[1]);
  first.join.listeners.click();
  first.username.value = "new-student";
  second.join.listeners.click();
  second.username.value = "another-student";
  await first.form.listeners.submit({ preventDefault() {} });
  assert.equal(requests[1].options.method, "POST");
  assert.equal(requests[1].url, "/activities/Chess%20Club/signup?email=new-student%40mergington.edu");
  assert.equal(requests[2].url, "/activities");
  assert.equal(first.form.hidden, true);
  assert.equal(first.username.value, "");
  assert.equal(first.message.textContent, "You're signed up!");
  assert.equal(first.message.focused, true);
  assert.equal(first.availability.textContent, "8 spots left");
  assert.equal(find(card, "summary").textContent, "View participants (2)");
  assert.equal(elements["activities-list"].children[0], card);
  assert.equal(second.username.value, "another-student");
  assert.equal(second.form.hidden, false);
});

test("API errors stay on the card and preserve username for retry", async () => {
  const { elements, errors } = await loadApp({
    post: async () => ({ ok: false, json: async () => ({ detail: "Already registered" }) }),
  });
  const { join, form, username, message, confirm } = controls(elements["activities-list"].children[0]);
  join.listeners.click();
  username.value = "student";
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(message.textContent, "Already registered");
  assert.equal(message.className, "message error");
  assert.equal(form.hidden, false);
  assert.equal(username.value, "student");
  assert.equal(confirm.disabled, false);
  assert.equal(errors.length, 1);
});

test("network failures allow retry and report the failure", async () => {
  const { elements, errors } = await loadApp({
    post: async () => { throw new Error("Offline"); },
  });
  const { form, username, message, confirm } = controls(elements["activities-list"].children[0]);
  username.value = "student";
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(message.textContent, "Offline");
  assert.equal(message.className, "message error");
  assert.equal(confirm.disabled, false);
  assert.equal(username.disabled, false);
  assert.equal(errors.length, 1);
});

test("refresh failure explicitly distinguishes successful signup from stale availability", async () => {
  const { elements, errors } = await loadApp({ refreshFailure: true });
  const { form, username, message } = controls(elements["activities-list"].children[0]);
  username.value = "student";
  await form.listeners.submit({ preventDefault() {} });
  assert.match(message.textContent, /You're signed up, but availability could not refresh/);
  assert.equal(form.hidden, true);
  assert.equal(errors.length, 1);
});

test("pending signup disables controls and prevents duplicate submission", async () => {
  let finish;
  const { elements, requests } = await loadApp({
    post: () => new Promise((resolve) => { finish = resolve; }),
  });
  const { form, confirm, cancel, username } = controls(elements["activities-list"].children[0]);
  const pending = form.listeners.submit({ preventDefault() {} });
  assert.equal(confirm.disabled, true);
  assert.equal(cancel.disabled, true);
  assert.equal(username.disabled, true);
  assert.equal(confirm.textContent, "Signing up...");
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(requests.length, 2);
  finish({ ok: true, json: async () => ({}) });
  await pending;
  assert.equal(confirm.disabled, false);
});

test("invalid usernames do not submit and full activities disable Join", async () => {
  const { elements, requests } = await loadApp({ full: true });
  const first = controls(elements["activities-list"].children[0]);
  assert.equal(first.join.disabled, true);
  assert.equal(first.availability.textContent, "Full");
  const second = controls(elements["activities-list"].children[1]);
  second.form.valid = false;
  await second.form.listeners.submit({ preventDefault() {} });
  assert.equal(requests.length, 1);
});

test("activity names are URL-encoded for signup", async () => {
  const { elements, requests } = await loadApp();
  const { form, username } = controls(elements["activities-list"].children[1]);
  username.value = "student";
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(requests[1].url, "/activities/Arts%20%26%20Crafts/signup?email=student%40mergington.edu");
});

test("initial loading errors and empty activity lists are explicit", async () => {
  const failed = await loadApp({ initialFailure: true });
  assert.match(failed.elements["activities-list"].children[0].textContent, /Failed to load/);
  assert.equal(failed.errors.length, 1);
  const empty = await loadApp({ empty: true });
  assert.equal(empty.elements["activities-list"].children[0].textContent, "No activities available right now.");
});
