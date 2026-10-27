
const {
  isValidStripeSubscription,
  matchesExistingBillingIdentity,
} = require("./billingValidation");

function createStripeWebhookProcessor({
  stripe,
  getClientById,
  updateClientBilling,
  isStripeLiveMode,
}) {
  async function processCheckout(checkoutSession) {
    const clientId = checkoutSession.metadata?.clientId;
    const subscriptionId =
      typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : checkoutSession.subscription?.id;
    const customerId =
      typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : checkoutSession.customer?.id;

    if (
      checkoutSession.mode !== "subscription" ||
      !clientId ||
      !subscriptionId ||
      !customerId
    ) {
      return;
    }

    const subscription =
      await stripe.subscriptions.retrieve(subscriptionId);

    const subscriptionCustomerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    const client = await getClientById(clientId);


    const existingSubscriptionId =
      client?.billing_subscription_id ??
      client?.billingSubscriptionId;

    const existingStatus =
      client?.subscription_status ??
      client?.subscriptionStatus;

    if (
      existingStatus === "active" &&
      existingSubscriptionId &&
      existingSubscriptionId !== subscriptionId
    ) {
      try {
        const existingSubscription =
          await stripe.subscriptions.retrieve(
            existingSubscriptionId
          );

        if (
          isValidStripeSubscription(
            existingSubscription,
            clientId,
            isStripeLiveMode
          )
        ) {
          console.warn(
            "Ignoring checkout because an active subscription already exists."
          );
          return;
        }
      } catch (error) {
        if (
          error.type === "StripeAPIError" ||
          error.type === "StripeConnectionError" ||
          error.type === "StripeRateLimitError" ||
          error.type === "StripeAPIConnectionError" ||
          (typeof error.statusCode === "number" &&
            error.statusCode >= 500 &&
            error.statusCode < 600)
        ) {
          throw error;
        }

        console.warn(
          "Existing subscription could not be verified:",
          error.message
        );
      }
    }
const existingCustomerId =
  client?.billing_customer_id ??
  client?.billingCustomerId;

const isReturningCanceledCustomer =
  existingStatus === "canceled" &&
  existingCustomerId === customerId &&
  existingSubscriptionId !== subscriptionId;

    if (
      client &&
     (
  matchesExistingBillingIdentity(
    client,
    customerId,
    subscriptionId
  ) ||
  isReturningCanceledCustomer
) &&
      subscriptionCustomerId === customerId &&
      isValidStripeSubscription(
        subscription,
        clientId,
        isStripeLiveMode
      )
    ) {
      await updateClientBilling(clientId, {
  subscriptionStatus: "active",
  billingCustomerId: customerId,
  billingSubscriptionId: subscriptionId,
  expectedCustomerId: existingCustomerId || undefined,
  expectedSubscriptionId: existingSubscriptionId || undefined,
});
    }
  }


  async function processCancellation(subscription) {
    const clientId = subscription.metadata?.clientId;

    if (!clientId || !subscription.id) {
      return;
    }

    const client = await getClientById(clientId);

    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    const existingCustomerId =
      client?.billing_customer_id ??
      client?.billingCustomerId;

    const existingSubscriptionId =
      client?.billing_subscription_id ??
      client?.billingSubscriptionId;

    if (
      !client ||
      !customerId ||
      !existingCustomerId ||
      !existingSubscriptionId ||
      existingCustomerId !== customerId ||
      existingSubscriptionId !== subscription.id ||
      subscription.livemode !== isStripeLiveMode
    ) {
      return;
    }

   await updateClientBilling(clientId, {
  subscriptionStatus: "canceled",
  billingCustomerId: customerId,
  billingSubscriptionId: subscription.id,
    expectedCustomerId: customerId,
  expectedSubscriptionId: subscription.id,
  expectedCustomerId: customerId,
  expectedSubscriptionId: subscription.id,
});
  }

  async function processSubscriptionUpdate(subscription) {
    const clientId = subscription.metadata?.clientId;

    if (!clientId || !subscription.id) {
      return;
    }

    const client = await getClientById(clientId);

    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    const existingCustomerId =
      client?.billing_customer_id ??
      client?.billingCustomerId;

    const existingSubscriptionId =
      client?.billing_subscription_id ??
      client?.billingSubscriptionId;

    if (
      !client ||
      !customerId ||
      !existingCustomerId ||
      !existingSubscriptionId ||
      existingCustomerId !== customerId ||
      existingSubscriptionId !== subscription.id ||
      subscription.livemode !== isStripeLiveMode
    ) {
      return;
    }

    const allowedStatus = isValidStripeSubscription(
      subscription,
      clientId,
      isStripeLiveMode
    )
      ? "active"
      : subscription.status;

    await updateClientBilling(clientId, {
      subscriptionStatus: allowedStatus,
      billingCustomerId: customerId,
      billingSubscriptionId: subscription.id,
      cancelAtPeriodEnd:
        subscription.cancel_at_period_end ||
        Boolean(subscription.cancel_at),
      currentPeriodEnd: subscription.current_period_end
        ? new Date(
            subscription.current_period_end * 1000
          ).toISOString()
        : null,
    });
  }


return {
  processCheckout,
  processCancellation,
  processSubscriptionUpdate,
};
}

module.exports = { createStripeWebhookProcessor };
