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

      attribution: window.peakAttribution?.read() || {},

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

      // Identify only a server-confirmed new account; signup_completed is sent by the server once.
      try { if (data.owner?.id) window.peakAnalytics?.setIdentity(data.owner.id, { email: data.owner.email, name: data.owner.name }); } catch {}

      registerMessage.textContent =
        "Account created. Sign in next, then activate your trial in secure checkout to open your dashboard.";

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