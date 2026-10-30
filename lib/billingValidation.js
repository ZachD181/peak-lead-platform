
function isValidStripeSubscription(
  subscription,
  clientId,
  isStripeLiveMode
) {
  if (!subscription || !clientId) {
    return false;
  }

  const validStatus = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused"
].includes(subscription.status);

  const validEnvironment =
    subscription.livemode === isStripeLiveMode;

  const validClient =
    subscription.metadata?.clientId ===
    String(clientId);

  return (
    validStatus &&
    validEnvironment &&
    validClient
  );
}

function hasValidTrial(
  subscriptionStatus,
  trialEndsAt,
  now = Date.now()
) {
  return (
    subscriptionStatus === "trialing" &&
    Boolean(trialEndsAt) &&
    Number.isFinite(
      new Date(trialEndsAt).getTime()
    ) &&
    new Date(trialEndsAt).getTime() > now
  );
}

function isTemporaryStripeFailure(error) {
  if (!error) {
    return false;
  }

  return (
    error.type === "StripeAPIError" ||
    error.type === "StripeConnectionError" ||
    error.type === "StripeRateLimitError" ||
    error.type === "StripeAPIConnectionError" ||
    (typeof error.statusCode === "number" &&
      error.statusCode >= 500 &&
      error.statusCode < 600)
  );
}

function matchesExistingBillingIdentity(
  client,
  customerId,
  subscriptionId
) {
  if (!client || !customerId || !subscriptionId) {
    return false;
  }

  const existingCustomerId =
    client.billing_customer_id ??
    client.billingCustomerId;

  const existingSubscriptionId =
    client.billing_subscription_id ??
    client.billingSubscriptionId;

  if (
    existingCustomerId &&
    existingCustomerId !== customerId
  ) {
    return false;
  }

  if (
    existingSubscriptionId &&
    existingSubscriptionId !== subscriptionId
  ) {
    return false;
  }

  return true;
}
module.exports = {
  isValidStripeSubscription,
  hasValidTrial,
  isTemporaryStripeFailure,
  matchesExistingBillingIdentity,
};