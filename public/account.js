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