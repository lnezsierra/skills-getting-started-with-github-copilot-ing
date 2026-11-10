document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const selectedActivityText = document.getElementById("selected-activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const messageText = document.getElementById("message-text");
  const signupButton = document.getElementById("signup-button");
  const dismissMessageButton = document.getElementById("dismiss-message");
  const usernameInput = document.getElementById("username");
  const activitySearch = document.getElementById("activity-search");
  const activityCount = document.getElementById("activity-count");
  const activitiesEmpty = document.getElementById("activities-empty");
  const activityCards = new Map();
  const fullActivities = new Set();
  let activitiesLoaded = false;
  let selectedActivity = "";
  let isSubmitting = false;

  function updateSignupButton() {
    const isFull = fullActivities.has(selectedActivity);
    signupButton.disabled = isSubmitting || isFull || !selectedActivity;
    signupButton.textContent = isSubmitting ? "Signing up..." : isFull ? "Activity full" : "Sign Up";
    selectedActivityText.textContent = selectedActivity
      ? `Selected activity: ${selectedActivity}${isFull ? " (Full)" : ""}`
      : "Choose an activity using its Join button.";
    selectedActivityText.className = selectedActivity
      ? "selected-activity has-selection" : "selected-activity";
    activityCards.forEach(({ card, joinButton }, name) => {
      const isSelected = selectedActivity === name;
      card.setAttribute("data-selected", String(isSelected));
      joinButton.setAttribute("aria-pressed", String(isSelected));
      joinButton.disabled = isSubmitting || fullActivities.has(name);
      joinButton.textContent = fullActivities.has(name) ? "Full" : isSelected ? "Selected" : "Join";
    });
  }

  function filterActivities() {
    if (!activitiesLoaded) {
      return;
    }
    const query = activitySearch.value.trim().toLowerCase();
    let visibleCount = 0;
    activityCards.forEach(({ card, searchText }) => {
      card.hidden = !searchText.includes(query);
      if (!card.hidden) {
        visibleCount++;
      }
    });
    activityCount.textContent = `${visibleCount} ${visibleCount === 1 ? "activity" : "activities"} found`;
    activitiesEmpty.hidden = visibleCount > 0;
  }

  activitySearch.addEventListener("input", filterActivities);

  function showMessage(text, type) {
    messageText.textContent = text;
    messageDiv.className = `message ${type}`;
  }

  dismissMessageButton.addEventListener("click", () => {
    messageDiv.classList.add("hidden");
    if (signupButton.disabled) {
      usernameInput.focus();
    } else {
      signupButton.focus();
    }
  });

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      if (!response.ok) {
        throw new Error(`Failed to load activities: ${response.status}`);
      }
      const activities = await response.json();
      activitiesLoaded = true;

      // Clear loading message
      activitiesList.innerHTML = "";
      activityCards.clear();
      fullActivities.clear();

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft = Math.max(0, details.max_participants - details.participants.length);
        const availability = spotsLeft === 0
          ? "full"
          : spotsLeft / details.max_participants <= 0.2 ? "limited" : "available";
        const spotsLabel = `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`;
        const availabilityLabel = availability === "full"
          ? "Full"
          : availability === "limited" ? `Almost full - ${spotsLabel}` : spotsLabel;
        if (spotsLeft === 0) {
          fullActivities.add(name);
        }

        activityCard.innerHTML = `
          <div class="activity-card-header">
            <h3>${name}</h3>
            <span class="availability-badge availability-${availability}">${availabilityLabel}</span>
          </div>
          <p class="activity-description">${details.description}</p>
          <p class="activity-schedule"><strong>Schedule:</strong> ${details.schedule}</p>
        `;

        const participantsSection = document.createElement("details");
        participantsSection.className = "participants";
        const participantsHeading = document.createElement("summary");
        participantsHeading.textContent = `Participants (${details.participants.length})`;
        participantsSection.appendChild(participantsHeading);

        if (details.participants.length > 0) {
          const participantsList = document.createElement("ul");
          details.participants.forEach((email) => {
            const participant = document.createElement("li");
            participant.textContent = email;
            participantsList.appendChild(participant);
          });
          participantsSection.appendChild(participantsList);
        } else {
          const emptyMessage = document.createElement("p");
          emptyMessage.textContent = "No participants yet.";
          participantsSection.appendChild(emptyMessage);
        }

        activityCard.appendChild(participantsSection);
        const joinButton = document.createElement("button");
        joinButton.type = "button";
        joinButton.className = "join-button";
        joinButton.disabled = spotsLeft === 0;
        joinButton.textContent = spotsLeft === 0 ? "Full" : "Join";
        joinButton.setAttribute("aria-label", spotsLeft === 0 ? `${name} is full` : `Join ${name}`);
        joinButton.addEventListener("click", () => {
          selectedActivity = name;
          updateSignupButton();
          usernameInput.focus();
        });
        activityCard.appendChild(joinButton);
        activityCards.set(name, {
          card: activityCard,
          joinButton,
          searchText: `${name} ${details.description} ${details.schedule}`.toLowerCase(),
        });
        activitiesList.appendChild(activityCard);
      });
      if (!Object.keys(activities).includes(selectedActivity)) {
        selectedActivity = "";
      }
      updateSignupButton();
      filterActivities();
    } catch (error) {
      activitiesLoaded = false;
      activityCards.clear();
      fullActivities.clear();
      selectedActivity = "";
      updateSignupButton();
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      activityCount.textContent = "Activities unavailable";
      activitiesEmpty.hidden = true;
      console.error("Error fetching activities:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    if (!selectedActivity) {
      showMessage("Choose an activity using its Join button.", "error");
      return;
    }
    if (fullActivities.has(selectedActivity)) {
      showMessage("Activity is full. Please choose another activity.", "error");
      updateSignupButton();
      return;
    }

    const email = `${usernameInput.value}@mergington.edu`;
    const activity = selectedActivity;

    isSubmitting = true;
    updateSignupButton();
    signupForm.setAttribute("aria-busy", "true");
    messageDiv.classList.add("hidden");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();
        selectedActivity = "";
        await fetchActivities();
      } else {
        const errorMessage = Array.isArray(result.detail)
          ? result.detail.map((error) => error.msg).join(" ")
          : result.detail || "An error occurred";
        showMessage(errorMessage, "error");
        if (response.status === 409) {
          await fetchActivities();
        }
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    } finally {
      isSubmitting = false;
      updateSignupButton();
      signupForm.removeAttribute("aria-busy");
    }
  });

  // Initialize app
  updateSignupButton();
  fetchActivities();
});
