document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const messageText = document.getElementById("message-text");
  const signupButton = document.getElementById("signup-button");
  const dismissMessageButton = document.getElementById("dismiss-message");
  const usernameInput = document.getElementById("username");
  const fullActivities = new Set();
  let isSubmitting = false;

  function updateSignupButton() {
    const isFull = fullActivities.has(activitySelect.value);
    signupButton.disabled = isSubmitting || isFull;
    signupButton.textContent = isSubmitting ? "Signing up..." : isFull ? "Activity full" : "Sign Up";
  }

  activitySelect.addEventListener("change", updateSignupButton);

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
      const selectedActivity = activitySelect.value;

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.options.length = 1;
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
            <h4>${name}</h4>
            <span class="availability-badge availability-${availability}">${availabilityLabel}</span>
          </div>
          <p class="activity-description">${details.description}</p>
          <p class="activity-schedule"><strong>Schedule:</strong> ${details.schedule}</p>
        `;

        const participantsSection = document.createElement("div");
        participantsSection.className = "participants";
        const participantsHeading = document.createElement("h5");
        participantsHeading.textContent = "Participants";
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
          activitySelect.value = name;
          updateSignupButton();
          usernameInput.focus();
        });
        activityCard.appendChild(joinButton);
        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = spotsLeft === 0 ? `${name} (Full)` : name;
        option.disabled = spotsLeft === 0;
        activitySelect.appendChild(option);
      });
      activitySelect.value = Object.keys(activities).includes(selectedActivity) ? selectedActivity : "";
      updateSignupButton();
    } catch (error) {
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    if (fullActivities.has(activitySelect.value)) {
      showMessage("Activity is full. Please choose another activity.", "error");
      updateSignupButton();
      return;
    }

    const email = `${usernameInput.value}@mergington.edu`;
    const activity = activitySelect.value;

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
  fetchActivities();
});
