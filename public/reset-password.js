const resetPasswordForm =
  document.getElementById(
    "reset-password-form"
  );

const resetPasswordMessage =
  document.getElementById(
    "reset-password-message"
  );

const params =
  new URLSearchParams(
    window.location.search
  );

const token =
  params.get("token");

if (!token) {
  resetPasswordMessage.textContent =
    "This password reset link is invalid.";

  resetPasswordForm.style.display =
    "none";
}

resetPasswordForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const password =
      document
        .getElementById("password")
        .value;

    const confirmPassword =
      document
        .getElementById(
          "confirm-password"
        )
        .value;

    if (password !== confirmPassword) {
      resetPasswordMessage.textContent =
        "Passwords do not match.";

      return;
    }

    resetPasswordMessage.textContent =
      "Resetting password...";

    try {
      const response = await fetch(
        "/api/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            token,
            password,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to reset password."
        );
      }

      resetPasswordMessage.textContent =
        "Password reset successfully. You can now log in.";

      resetPasswordForm.style.display =
        "none";
    } catch (error) {
      resetPasswordMessage.textContent =
        error.message;
    }
  }
);