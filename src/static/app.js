document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const cards = new Map();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function createCard(name, index) {
    const card = element("article", "", "activity-card");
    const title = element("h3", name);
    title.id = `activity-${index}`;
    card.setAttribute("aria-labelledby", title.id);
    const description = element("p", "", "activity-description");
    const schedule = element("p", "", "schedule");
    const availability = element("p", "", "availability");
    const participants = element("details", "", "participants-section");
    const summary = element("summary");
    const participantList = element("ul", "", "participants-list");
    const emptyParticipants = element("p", "No participants yet.");
    participants.append(summary, participantList, emptyParticipants);

    const join = element("button", "Join");
    join.type = "button";
    join.setAttribute("aria-label", `Join ${name}`);
    join.setAttribute("aria-expanded", "false");
    const form = element("form", "", "signup-form");
    form.id = `signup-${index}`;
    form.hidden = true;
    form.setAttribute("aria-label", `Join ${name}`);
    join.setAttribute("aria-controls", form.id);
    const label = element("label", "School username");
    const username = element("input");
    username.id = `username-${index}`;
    label.htmlFor = username.id;
    username.name = "username";
    username.type = "text";
    username.required = true;
    username.placeholder = "your-username";
    username.pattern = "[^@\\s]+";
    username.title = "Enter only your school username, without @mergington.edu.";
    username.autocomplete = "username";
    username.setAttribute("autocapitalize", "none");
    username.spellcheck = false;
    const help = element("small", "We add @mergington.edu automatically.");
    help.id = `email-help-${index}`;
    username.setAttribute("aria-describedby", help.id);
    const email = element("div", "", "school-email");
    const domain = element("span", "@mergington.edu", "email-domain");
    domain.setAttribute("aria-hidden", "true");
    email.append(username, domain);
    const actions = element("div", "", "form-actions");
    const confirm = element("button", "Confirm");
    confirm.type = "submit";
    const cancel = element("button", "Cancel", "secondary");
    cancel.type = "button";
    actions.append(confirm, cancel);
    form.append(label, email, help, actions);

    const message = element("p", "", "message");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    message.tabIndex = -1;
    card.append(title, description, schedule, availability, participants, join, form, message);
    let pending = false;

    function update(details) {
      description.textContent = details.description;
      schedule.textContent = details.schedule;
      const spots = Math.max(0, details.max_participants - details.participants.length);
      availability.textContent = spots === 0 ? "Full" : `${spots} ${spots === 1 ? "spot" : "spots"} left`;
      join.disabled = spots === 0;
      join.textContent = spots === 0 ? "Full" : "Join";
      summary.textContent = `View participants (${details.participants.length})`;
      participantList.replaceChildren(...details.participants.map((email) => element("li", email)));
      emptyParticipants.hidden = details.participants.length > 0;
    }

    function closeForm() {
      form.hidden = true;
      join.hidden = false;
      join.setAttribute("aria-expanded", "false");
    }

    join.addEventListener("click", () => {
      form.hidden = false;
      join.hidden = true;
      join.setAttribute("aria-expanded", "true");
      message.textContent = "";
      username.focus();
    });

    cancel.addEventListener("click", () => {
      closeForm();
      message.textContent = "";
      join.focus();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (pending || !form.reportValidity()) return;
      pending = true;
      confirm.disabled = true;
      cancel.disabled = true;
      username.disabled = true;
      confirm.textContent = "Signing up...";
      message.textContent = "";
      const email = `${username.value}@mergington.edu`;

      try {
        const response = await fetch(
          `/activities/${encodeURIComponent(name)}/signup?email=${encodeURIComponent(email)}`,
          { method: "POST" }
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(typeof result.detail === "string" ? result.detail : "Unable to sign up. Please try again.");
        }
        closeForm();
        form.reset();
        message.className = "message success";
        message.textContent = "You're signed up!";
        message.focus();
        try {
          await fetchActivities();
        } catch (error) {
          message.className = "message error";
          message.textContent = "You're signed up, but availability could not refresh. Please reload the page.";
          console.error("Error refreshing activities:", error);
        }
      } catch (error) {
        message.className = "message error";
        message.textContent = error.message || "Failed to sign up. Please try again.";
        message.focus();
        console.error("Error signing up:", error);
      } finally {
        pending = false;
        confirm.disabled = false;
        cancel.disabled = false;
        username.disabled = false;
        confirm.textContent = "Confirm";
      }
    });

    return { card, update };
  }

  async function fetchActivities() {
    const response = await fetch("/activities");
    if (!response.ok) throw new Error(`Failed to load activities: ${response.status}`);
    const activities = await response.json();
    if (cards.size === 0) activitiesList.replaceChildren();
    Object.entries(activities).forEach(([name, details], index) => {
      if (!cards.has(name)) {
        const entry = createCard(name, index);
        cards.set(name, entry);
        activitiesList.append(entry.card);
      }
      cards.get(name).update(details);
    });
    if (cards.size === 0) {
      activitiesList.append(element("p", "No activities available right now."));
    }
  }

  fetchActivities().catch((error) => {
    activitiesList.replaceChildren(element("p", "Failed to load activities. Please reload to try again.", "error"));
    console.error("Error fetching activities:", error);
  });
});
