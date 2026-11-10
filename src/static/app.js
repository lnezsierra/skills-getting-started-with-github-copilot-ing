document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const messageText = document.getElementById("message-text");
  const signupButton = document.getElementById("signup-button");
  const dismissMessageButton = document.getElementById("dismiss-message");

  function showMessage(text, type) {
    messageText.textContent = text;
    messageDiv.className = `message ${type}`;
  }

  dismissMessageButton.addEventListener("click", () => {
    messageDiv.classList.add("hidden");
    signupButton.focus();
  });

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      if (!response.ok) {
        throw new Error(`Failed to load activities: ${response.status}`);
      }
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.options.length = 1;

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
        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });
    } catch (error) {
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (signupButton.disabled) {
      return;
    }

    const email = `${document.getElementById("username").value}@mergington.edu`;
    const activity = document.getElementById("activity").value;

    signupButton.disabled = true;
    signupButton.textContent = "Signing up...";
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
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    } finally {
      signupButton.disabled = false;
      signupButton.textContent = "Sign Up";
      signupForm.removeAttribute("aria-busy");
    }
  });

  // Initialize app
  fetchActivities();
});
