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

      if (
  response.status === 401 ||
  response.status === 403
) {
  window.location.href =
    "/login.html";

  return;
}

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

if (
  response.status === 401 ||
  response.status === 403
) {
  window.location.href =
    "/login.html";

  return;
}

if (!response.ok) {
  throw new Error(
    data.error ||
    "Unable to load billing status."
  );
}

    const status =
      data.subscriptionStatus;

    const awaitingActivation = status === "inactive" && !data.billingSubscriptionId && !data.trialEndsAt;
    const newCustomerPlan = document.getElementById("new-customer-plan");
    if (newCustomerPlan) newCustomerPlan.hidden = !awaitingActivation;
    if (awaitingActivation) {
      billingTitle.textContent = "Activate your 14-day Peak trial";
      billingSubtitle.textContent = "Your account is ready. Complete secure Stripe checkout to activate your trial and open your dashboard. A payment method is required; checkout shows the price and renewal date before you confirm.";
    } else if (status === "inactive") {
      billingTitle.textContent = "Activate your Peak subscription";
      billingSubtitle.textContent = "Complete secure checkout to restore dashboard access. Review your billing terms before confirming.";
    } else if (status === "active") {
  billingTitle.textContent =
    "Manage your Peak subscription";

  if (data.cancelAtPeriodEnd && data.currentPeriodEnd) {
    const periodEnd =
      new Date(data.currentPeriodEnd);

    const formattedDate =
      periodEnd.toLocaleDateString(
        undefined,
        {
          month: "long",
          day: "numeric",
          year: "numeric",
        }
      );

    billingSubtitle.textContent =
      `Your Peak subscription is active until ${formattedDate} and will not renew.`;
  } else {
    billingSubtitle.textContent =
      "Update your billing details or manage your current Peak subscription.";
  }
}else if (status === "canceled") {
  billingTitle.textContent =
    "Your Peak subscription has ended";

  billingSubtitle.textContent =
    "Restart your subscription to restore full access to Peak.";
} else if (status === "trialing") {
  billingTitle.textContent = data.cancelAtPeriodEnd ? "Your Peak trial is ending" : "Your Peak trial";

  if (data.trialEndsAt) {
    const trialEnd = new Date(data.trialEndsAt);
    const now = new Date();

    const millisecondsRemaining =
      trialEnd.getTime() - now.getTime();

    const daysRemaining = Math.max(
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

    billingSubtitle.innerHTML =
      `Trial ${data.cancelAtPeriodEnd ? "access ends" : "ends"} ${formattedDate}<br>` +
      `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} remaining`;
  } else {
    billingSubtitle.textContent =
      "Manage your trial or upgrade to continue using Peak.";
  }
}

    const hasStripeCustomer =
      Boolean(data.billingCustomerId);

    if (upgradeButton) {
      upgradeButton.textContent = awaitingActivation ? "Start my 14-day trial" : "Activate Peak";
      upgradeButton.style.display =
        (status === "active" || (status === "trialing" && Boolean(data.billingSubscriptionId)))
          ? "none"
          : "inline-block";
    }

    if (manageSubscriptionButton) {
      manageSubscriptionButton.textContent =
        data.cancelAtPeriodEnd && ["active", "trialing"].includes(status)
          ? "Resume Subscription"
          : "Manage Subscription";
      manageSubscriptionButton.style.display =
        hasStripeCustomer
          ? "inline-block"
          : "none";
    }

    if (billingMessage) {
  if (awaitingActivation) { billingMessage.textContent = "Your trial has not started yet. Creating your account did not charge your card."; }
  else if (status === "active" && data.cancelAtPeriodEnd) {
    billingMessage.textContent = "";
  } else if (status === "active") {
    billingMessage.textContent =
      "Your Peak subscription is active.";
  } else if (status === "canceled") {
    billingMessage.textContent =
      "Your Peak subscription is canceled. Upgrade to restore access.";
  } else if (status === "trialing" && data.cancelAtPeriodEnd) {
    billingMessage.textContent =
      "Cancellation scheduled. You can use Peak until your trial ends, and your subscription will not renew. To keep it, choose Resume Subscription and confirm in Stripe.";
  } else if (status === "trialing") {
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