const registerForm =
  document.getElementById(
    "register-form"
  );

const registerMessage =
  document.getElementById(
    "register-message"
  );

registerForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    registerMessage.textContent =
      "Creating your account...";

    const payload = {
  companyName:
        document.getElementById(
          "business-name"
        ).value.trim(),

      industry:
        document.getElementById(
          "industry"
        ).value.trim(),

      ownerName:
        document.getElementById(
          "owner-name"
        ).value.trim(),

      ownerEmail:
        document.getElementById(
          "owner-email"
        ).value.trim(),

      ownerPassword:
        document.getElementById(
          "owner-password"
        ).value,
    };

    try {
      const response = await fetch(
        "/api/register",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify(payload),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to create account."
        );
      }

      registerMessage.textContent =
        "Account created. Redirecting to login...";

      setTimeout(() => {
        window.location.href =
          "/login.html";
      }, 1200);

    } catch (error) {
      registerMessage.textContent =
        error.message;
    }
  }
);