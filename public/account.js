const companyElement =
  document.getElementById(
    "account-company"
  );

const emailElement =
  document.getElementById(
    "account-email"
  );

const subscriptionElement =
  document.getElementById(
    "account-subscription"
  );

const logoutButton =
  document.getElementById(
    "account-logout-button"
  );

   const companySettingsForm =
  document.getElementById(
    "company-settings-form"
  );

const companyNameInput =
  document.getElementById(
    "company-name"
  );

const companyIndustryInput =
  document.getElementById(
    "company-industry"
  );

const companySettingsMessage =
  document.getElementById(
    "company-settings-message"
  );

  const profileForm =
  document.getElementById(
    "profile-form"
  );

const profileNameInput =
  document.getElementById(
    "profile-name"
  );

const profileEmailInput =
  document.getElementById(
    "profile-email"
  );

const profileMessage =
  document.getElementById(
    "profile-message"
  );

  companySettingsForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    companySettingsMessage.textContent =
      "Saving company settings...";

    try {
      const response = await fetch(
        "/api/account/company",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name:
              companyNameInput.value.trim(),

            industry:
              companyIndustryInput.value.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to save company settings."
        );
      }

      companyElement.textContent =
        data.client.name;

      companySettingsMessage.textContent =
        "Company settings saved.";
    } catch (error) {
      companySettingsMessage.textContent =
        error.message;
    }
  }
);

profileForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    profileMessage.textContent =
      "Saving profile...";

    try {
      const response = await fetch(
        "/api/account/profile",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name:
              profileNameInput.value.trim(),

            email:
              profileEmailInput.value.trim(),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to save profile."
        );
      }

      emailElement.textContent =
        data.user.email;

      profileNameInput.value =
        data.user.name;

      profileEmailInput.value =
        data.user.email;

      profileMessage.textContent =
        "Profile saved.";

      const storedUser =
        JSON.parse(
          sessionStorage.getItem(
            "peak-user"
          ) || "null"
        );

      if (storedUser) {
        storedUser.name =
          data.user.name;

        storedUser.email =
          data.user.email;

        sessionStorage.setItem(
          "peak-user",
          JSON.stringify(storedUser)
        );
      }
    } catch (error) {
      profileMessage.textContent =
        error.message;
    }
  }
);

async function loadAccount() {
  try {
    const response =
      await fetch("/api/me");

    const data =
      await response.json();

    if (!response.ok) {
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        window.location.href =
          "/login.html";

        return;
      }

      throw new Error(
        data.error ||
        "Unable to load account."
      );
    }

    companyElement.textContent =
      data.client?.name ||
      "Peak account";

    emailElement.textContent =
      data.user?.email || "";

    companyNameInput.value =
      data.client?.name || "";

    companyIndustryInput.value =
      data.client?.industry || "";

    profileNameInput.value =
      data.user?.name || "";

    profileEmailInput.value =
      data.user?.email || "";

  } catch (error) {
    console.error(
      "Account load error:",
      error
    );

    companyElement.textContent =
      "Unable to load account.";
  }

  try {
    const response =
      await fetch("/api/billing-status");

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to load subscription."
      );
    }

    const status =
      data.subscriptionStatus;

    if (status === "active") {
  subscriptionElement.textContent =
    "Your Peak subscription is active.";

} else if (
  status === "trial" &&
  data.trialEndsAt
) {
  const trialEnd =
    new Date(data.trialEndsAt);

  const now =
    new Date();

  const millisecondsRemaining =
    trialEnd.getTime() - now.getTime();

  const daysRemaining =
    Math.max(
      0,
      Math.ceil(
        millisecondsRemaining /
        (1000 * 60 * 60 * 24)
      )
    );

  const formattedDate =
    trialEnd.toLocaleDateString(
      undefined,
      {
        month: "long",
        day: "numeric",
        year: "numeric",
      }
    );

  subscriptionElement.innerHTML = `
    <strong>Peak Trial</strong><br>
    Trial ends ${formattedDate}<br>
    ${daysRemaining} ${
      daysRemaining === 1
        ? "day"
        : "days"
    } remaining
  `;

} else if (status === "trial") {
  subscriptionElement.textContent =
    "Your Peak account is on a trial.";

} else if (status === "canceled") {
  subscriptionElement.textContent =
    "Your Peak subscription is canceled.";

} else {
  subscriptionElement.textContent =
    `Subscription status: ${status}`;
}

  } catch (error) {
    console.error(
      "Billing status error:",
      error
    );

    subscriptionElement.textContent =
      "Unable to load subscription status.";
  }
}

logoutButton?.addEventListener(
  "click",
  async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
      });
    } finally {
      sessionStorage.removeItem(
        "peak-user"
      );

      window.location.href =
        "/login.html";
    }
  }
);

loadAccount();