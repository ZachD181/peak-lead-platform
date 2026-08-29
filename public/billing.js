const upgradeButton =
  document.getElementById("upgrade-button");

const manageSubscriptionButton =
  document.getElementById(
    "manage-subscription-button"
  );

const billingMessage =
  document.getElementById("billing-message");

      const billingTitle =
  document.getElementById("billing-title");

  const billingSubtitle =
  document.getElementById(
    "billing-subtitle"
  );


upgradeButton?.addEventListener(
  "click",
  async () => {
    upgradeButton.disabled = true;

    billingMessage.textContent =
      "Opening secure checkout...";

    try {
      const response = await fetch(
        "/api/create-checkout-session",
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to start checkout."
        );
      }

      if (!data.url) {
        throw new Error(
          "Checkout URL was not returned."
        );
      }

      window.location.href = data.url;
    } catch (error) {
      billingMessage.textContent =
        error.message;

      upgradeButton.disabled = false;
    }
  }
);


manageSubscriptionButton?.addEventListener(
  "click",
  async () => {
    manageSubscriptionButton.disabled = true;

    billingMessage.textContent =
      "Opening billing portal...";

    try {
      const response = await fetch(
        "/api/create-billing-portal",
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to open billing portal."
        );
      }

      if (!data.url) {
        throw new Error(
          "Billing portal URL was not returned."
        );
      }

      window.location.href = data.url;
    } catch (error) {
      billingMessage.textContent =
        error.message;

      manageSubscriptionButton.disabled = false;
    }
  }
);
async function loadBillingStatus() {
  try {
    const response = await fetch(
      "/api/billing-status"
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to load billing status."
      );
    }

    const status =
      data.subscriptionStatus;

      if (status === "active") {
  billingTitle.textContent =
    "Manage your Peak subscription";

  billingSubtitle.textContent =
    "Update your billing details or manage your current Peak subscription.";
} else if (status === "canceled") {
  billingTitle.textContent =
    "Your Peak subscription has ended";

  billingSubtitle.textContent =
    "Restart your subscription to restore full access to Peak.";
} else if (status === "trial") {
  billingTitle.textContent =
    "Your Peak trial";

  billingSubtitle.textContent =
    "Manage your trial or upgrade to continue using Peak.";
}

    const hasStripeCustomer =
      Boolean(data.billingCustomerId);

    if (upgradeButton) {
      upgradeButton.style.display =
        status === "active"
          ? "none"
          : "inline-block";
    }

    if (manageSubscriptionButton) {
      manageSubscriptionButton.style.display =
        hasStripeCustomer
          ? "inline-block"
          : "none";
    }

    if (billingMessage) {
      if (status === "active") {
        billingMessage.textContent =
          "Your Peak subscription is active.";
      } else if (status === "canceled") {
        billingMessage.textContent =
          "Your subscription is canceled. Upgrade to restore access.";
      } else if (status === "trial") {
        billingMessage.textContent =
          "Your Peak account is currently on trial.";
      }
    }
  } catch (error) {
    if (billingMessage) {
      billingMessage.textContent =
        error.message;
    }
  }
}
loadBillingStatus();