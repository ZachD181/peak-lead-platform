
const test = require("node:test");
const assert = require("node:assert/strict");
const Stripe = require("stripe");

// Fake test credentials. No real Stripe account is used.
const stripe = new Stripe("sk_test_webhook_testing_only");
const webhookSecret = "whsec_local_test_only";

test("accepts a correctly signed Stripe event", () => {
  const payload = JSON.stringify({
    id: "evt_test_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
      },
    },
  });

  const signature =
    stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

  const event = stripe.webhooks.constructEvent(
    Buffer.from(payload),
    signature,
    webhookSecret
  );

  assert.equal(event.id, "evt_test_123");
  assert.equal(event.type, "checkout.session.completed");
});

test("rejects an invalid Stripe signature", () => {
  const payload = JSON.stringify({
    id: "evt_test_456",
    type: "checkout.session.completed",
    data: {
      object: {},
    },
  });

  assert.throws(() => {
    stripe.webhooks.constructEvent(
      Buffer.from(payload),
      "invalid_signature",
      webhookSecret
    );
  });
});
