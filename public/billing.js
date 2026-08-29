const upgradeButton =
  document.getElementById("upgrade-button");

const billingMessage =
  document.getElementById("billing-message");

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