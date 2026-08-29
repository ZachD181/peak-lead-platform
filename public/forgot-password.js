const forgotPasswordForm =
  document.getElementById(
    "forgot-password-form"
  );

const forgotPasswordMessage =
  document.getElementById(
    "forgot-password-message"
  );

const testResetLink =
  document.getElementById(
    "test-reset-link"
  );

forgotPasswordForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    forgotPasswordMessage.textContent =
      "Creating secure reset link...";

    const email =
      document
        .getElementById("email")
        .value
        .trim();

    try {
      const response = await fetch(
        "/api/forgot-password",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to create reset link."
        );
      }

      forgotPasswordMessage.textContent =
        "If that email belongs to a Peak account, a reset link has been created.";

      if (data.resetUrl) {
        testResetLink.style.display =
          "block";

        testResetLink.innerHTML = `
          <p>Development test link:</p>
          <a href="${data.resetUrl}">
            Reset Password
          </a>
        `;
      }
    } catch (error) {
      forgotPasswordMessage.textContent =
        error.message;
    }
  }
);