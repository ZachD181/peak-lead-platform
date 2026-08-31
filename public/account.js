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

async function loadAccount() {
  try {
    const response =
      await fetch("/api/me");

    const data =
      await response.json();

    if (!response.ok) {
      window.location.href =
        "/login.html";

      return;
    }

    companyElement.textContent =
      data.client?.name ||
      "Peak account";

      companyNameInput.value =
  data.client?.name || "";

companyIndustryInput.value =
  data.client?.industry || "";

    emailElement.textContent =
      data.user?.email || "";
  } catch {
    window.location.href =
      "/login.html";
  }

  try {
    const response =
      await fetch(
        "/api/billing-status"
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        "Unable to load subscription."
      );
    }

   

    const status =
      data.subscriptionStatus;

    if (status === "active") {
      subscriptionElement.textContent =
        "Your Peak subscription is active.";
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
    subscriptionElement.textContent =
      error.message;
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