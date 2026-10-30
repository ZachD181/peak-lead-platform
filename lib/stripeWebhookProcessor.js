
const {
  isValidStripeSubscription,
  matchesExistingBillingIdentity,
} = require("./billingValidation");

function createStripeWebhookProcessor({
  stripe,
  getClientById,
  updateClientBilling,
  finalizeCheckoutBilling,
  getCheckoutReservation,
  completeCheckoutReservation,
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

if (
  checkoutSession.status !== "complete" ||
  checkoutSession.livemode !== isStripeLiveMode
) {
  throw new Error(
    "Stripe Checkout session failed status or environment validation."
  );
}

    const subscription =
      await stripe.subscriptions.retrieve(subscriptionId);

    const subscriptionCustomerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;
        if (subscriptionCustomerId !== customerId) {
  throw new Error(
    "Stripe subscription customer does not match Checkout customer."
  );
}

    const client = await getClientById(clientId);

const reservation =
  await getCheckoutReservation(clientId);

if (
  !reservation ||
  reservation.checkout_session_id !== checkoutSession.id
) {
  throw new Error(
    "Stripe Checkout reservation is missing or does not match."
  );
}
if (reservation.status === "completed") {
  const savedSubscriptionId =
    client?.billing_subscription_id ??
    client?.billingSubscriptionId;

  const savedCustomerId =
    client?.billing_customer_id ??
    client?.billingCustomerId;

  if (
    savedSubscriptionId === subscriptionId &&
    savedCustomerId === customerId
  ) {
    return;
  }

  throw new Error(
    "Completed Checkout does not match the saved subscription."
  );
}

    const existingSubscriptionId =
      client?.billing_subscription_id ??
      client?.billingSubscriptionId;

    const existingStatus =
      client?.subscription_status ??
      client?.subscriptionStatus;

   if (
  (existingStatus === "active" ||
    existingStatus === "trialing") &&
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
  console.error(
    "Duplicate active Stripe subscription detected:",
    {
      clientId,
      existingSubscriptionId,
      newSubscriptionId: subscriptionId,
    }
  );

  throw new Error(
    "Duplicate active Stripe subscription requires reconciliation."
  );
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
  !client ||
  !isValidStripeSubscription(
    subscription,
    clientId,
    isStripeLiveMode
  )
) {
  throw new Error(
    "Checkout subscription or client failed validation."
  );
}

if (
  !matchesExistingBillingIdentity(
    client,
    customerId,
    subscriptionId
  ) &&
  !isReturningCanceledCustomer
) {
  throw new Error(
    "Checkout subscription does not match the client's billing identity."
  );
}

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
     const updatedClient = await finalizeCheckoutBilling(
  clientId,
  reservation.id,
  checkoutSession.id,
  {
    subscriptionStatus: subscription.status,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : undefined,
    trialUsed: subscription.status === "trialing",
    expectedCustomerId: existingCustomerId || undefined,
    expectedSubscriptionId: existingSubscriptionId || undefined,
  }
);

if (!updatedClient) {
  throw new Error(
    "Stripe Checkout subscription could not be saved."
  );

}
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

  const updatedClient = await updateClientBilling(clientId, {
  subscriptionStatus: "canceled",
  billingCustomerId: customerId,
  billingSubscriptionId: subscription.id,
  expectedCustomerId: existingCustomerId,
  expectedSubscriptionId: existingSubscriptionId,
  trialEndsAt: subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : undefined,
  trialUsed: subscription.status === "trialing",
});

if (!updatedClient) {
  throw new Error(
    "Stripe subscription cancellation could not be saved."
  );
}
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




const latestSubscription =
  await stripe.subscriptions.retrieve(subscription.id);

if (
  latestSubscription.id !== subscription.id ||
  latestSubscription.livemode !== isStripeLiveMode ||
  latestSubscription.metadata?.clientId !== String(clientId)
) {
  throw new Error(
    "Latest Stripe subscription failed validation."
  );
}

const latestCustomerId =
  typeof latestSubscription.customer === "string"
    ? latestSubscription.customer
    : latestSubscription.customer?.id;

if (latestCustomerId !== customerId) {
  throw new Error(
    "Latest Stripe subscription customer does not match."
  );
}

const allowedStatus = latestSubscription.status;
const updatedClient = await updateClientBilling(clientId, {
  subscriptionStatus: allowedStatus,
      billingCustomerId: customerId,
      billingSubscriptionId: subscription.id,
      expectedCustomerId: existingCustomerId,
      expectedSubscriptionId: existingSubscriptionId,
cancelAtPeriodEnd:
  latestSubscription.cancel_at_period_end ||
  Boolean(latestSubscription.cancel_at),
currentPeriodEnd: latestSubscription.current_period_end
  ? new Date(
      latestSubscription.current_period_end * 1000
    ).toISOString()
  : null,
    });

    if (!updatedClient) {
      throw new Error(
        "Stripe subscription update could not be saved."
      );
    }
  }

return {
  processCheckout,
  processCancellation,
  processSubscriptionUpdate,
};
}

module.exports = { createStripeWebhookProcessor };
