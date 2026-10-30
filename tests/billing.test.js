
const assert = require("assert");

const {
  isValidStripeSubscription,
  hasValidTrial,
  isTemporaryStripeFailure,
  matchesExistingBillingIdentity,
} = require("../lib/billingValidation");

const clientId = "client-123";

const liveSubscription = {
  status: "active",
  livemode: true,
  metadata: { clientId },
};

// 1. Valid Live subscription
assert.strictEqual(
  isValidStripeSubscription(
    liveSubscription,
    clientId,
    true
  ),
  true
);

// 2. Sandbox subscription rejected in Live
assert.strictEqual(
  isValidStripeSubscription(
    { ...liveSubscription, livemode: false },
    clientId,
    true
  ),
  false
);

// 3. Canceled subscription rejected
assert.strictEqual(
  isValidStripeSubscription(
    { ...liveSubscription, status: "canceled" },
    clientId,
    true
  ),
  false
);

// 4. Subscription belonging to another client
assert.strictEqual(
  isValidStripeSubscription(
    liveSubscription,
    "different-client",
    true
  ),
  false
);

// 5. Valid trial
const now = Date.now();

assert.strictEqual(
  hasValidTrial(
    "trialing",
    new Date(now + 86400000).toISOString(),
    now
  ),
  true
);

// 6. Expired trial
assert.strictEqual(
  hasValidTrial(
    "trialing",
    new Date(now - 86400000).toISOString(),
    now
  ),
  false
);

// 7. Invalid trial expiration
assert.strictEqual(
  hasValidTrial("trialing", "invalid-date", now),
  false
);

const sandboxSubscription = {
  status: "active",
  livemode: false,
  metadata: { clientId },
};

// Sandbox subscription is valid in Sandbox mode.
assert.strictEqual(
  isValidStripeSubscription(
    sandboxSubscription,
    clientId,
    false
  ),
  true
);

// Missing subscription must be rejected.
assert.strictEqual(
  isValidStripeSubscription(null, clientId, true),
  false
);

// Missing customer metadata must be rejected.
assert.strictEqual(
  isValidStripeSubscription(
    { ...liveSubscription, metadata: {} },
    clientId,
    true
  ),
  false
);

// Past-due subscriptions must block duplicate Checkout.
assert.strictEqual(
  isValidStripeSubscription(
    { ...liveSubscription, status: "past_due" },
    clientId,
    true
  ),
  true
);

// Missing trial expiration must be rejected.
assert.strictEqual(
  hasValidTrial("trialing", null),
  false
);

// A canceled account cannot use its old trial.
assert.strictEqual(
  hasValidTrial(
    "canceled",
    new Date(Date.now() + 86400000).toISOString()
  ),
  false
);


const temporaryErrors = [
  { type: "StripeAPIError" },
  { type: "StripeConnectionError" },
  { type: "StripeAPIConnectionError" },
  { type: "StripeRateLimitError" },
  { statusCode: 500 },
  { statusCode: 503 },
];

for (const error of temporaryErrors) {
  assert.strictEqual(
    isTemporaryStripeFailure(error),
    true
  );
}

const nonTemporaryErrors = [
  { type: "StripeInvalidRequestError", statusCode: 404 },
  { type: "StripeAuthenticationError", statusCode: 401 },
  { statusCode: 400 },
  null,
];

for (const error of nonTemporaryErrors) {
  assert.strictEqual(
    isTemporaryStripeFailure(error),
    false
  );
}


const existingClient = {
  billing_customer_id: "cus_123",
  billing_subscription_id: "sub_123",
};

// Existing customer and subscription match.
assert.strictEqual(
  matchesExistingBillingIdentity(
    existingClient,
    "cus_123",
    "sub_123"
  ),
  true
);

// Different Stripe customer must be rejected.
assert.strictEqual(
  matchesExistingBillingIdentity(
    existingClient,
    "cus_999",
    "sub_123"
  ),
  false
);

// Different subscription must be rejected.
assert.strictEqual(
  matchesExistingBillingIdentity(
    existingClient,
    "cus_123",
    "sub_999"
  ),
  false
);

// New customers without billing IDs are allowed.
assert.strictEqual(
  matchesExistingBillingIdentity(
    {},
    "cus_new",
    "sub_new"
  ),
  true
);

// Missing customer records are rejected.
assert.strictEqual(
  matchesExistingBillingIdentity(
    null,
    "cus_123",
    "sub_123"
  ),
  false
);

console.log("Peak billing validation tests passed.");
assert.equal(
  matchesExistingBillingIdentity(
    {
      billing_customer_id: "cus_original",
      billing_subscription_id: "sub_original",
    },
    "cus_original",
    "sub_original"
  ),
  true
);

assert.equal(
  matchesExistingBillingIdentity(
    {
      billing_customer_id: "cus_original",
      billing_subscription_id: "sub_original",
    },
    "cus_different",
    "sub_original"
  ),
  false
);

assert.equal(
  matchesExistingBillingIdentity(
    {
      billing_customer_id: "cus_original",
      billing_subscription_id: "sub_original",
    },
    "cus_original",
    "sub_different"
  ),
  false
);
