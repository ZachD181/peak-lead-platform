
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStripeWebhookProcessor,
} = require("../lib/stripeWebhookProcessor");

test("valid checkout activates the correct customer", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async (id) => ({
          id,
          customer: "cus_test_123",
          status: "active",
          livemode: false,
          metadata: { clientId: "client-123" },
        }),
      },
    },

    getClientById: async (id) => ({
      id,
      billing_customer_id: null,
      billing_subscription_id: null,
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCheckout({
    mode: "subscription",
    metadata: { clientId: "client-123" },
    customer: "cus_test_123",
    subscription: "sub_test_123",
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].clientId, "client-123");
  assert.equal(updates[0].billing.subscriptionStatus, "active");
  assert.equal(
    updates[0].billing.billingSubscriptionId,
    "sub_test_123"
  );
});
test("checkout cannot overwrite a different subscription", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async (id) => ({
          id,
          customer: "cus_original",
          status: "active",
          livemode: false,
          metadata: { clientId: "client-123" },
        }),
      },
    },

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: "cus_original",
      billing_subscription_id: "sub_original",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCheckout({
    mode: "subscription",
    metadata: { clientId: "client-123" },
    customer: "cus_original",
    subscription: "sub_different",
  });

  assert.equal(
    updates.length,
    0,
    "A different subscription must not overwrite the existing one"
  );
});
test("duplicate checkout keeps the same billing identity", async () => {
  const updates = [];

  let client = {
    id: "client-123",
    billing_customer_id: null,
    billing_subscription_id: null,
  };

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async (id) => ({
          id,
          customer: "cus_test_123",
          status: "active",
          livemode: false,
          metadata: { clientId: "client-123" },
        }),
      },
    },

    getClientById: async () => client,

    updateClientBilling: async (clientId, billing) => {
      updates.push(billing);

      client = {
        ...client,
        billing_customer_id: billing.billingCustomerId,
        billing_subscription_id: billing.billingSubscriptionId,
      };
    },
  });

  const checkout = {
    mode: "subscription",
    metadata: { clientId: "client-123" },
    customer: "cus_test_123",
    subscription: "sub_test_123",
  };

  await processor.processCheckout(checkout);
  await processor.processCheckout(checkout);

  assert.equal(updates.length, 2);
  assert.equal(client.billing_customer_id, "cus_test_123");
  assert.equal(client.billing_subscription_id, "sub_test_123");
});
test("Sandbox subscription cannot activate a Live account", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: true,

    stripe: {
      subscriptions: {
        retrieve: async (id) => ({
          id,
          customer: "cus_test_123",
          status: "active",
          livemode: false,
          metadata: { clientId: "client-123" },
        }),
      },
    },

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: null,
      billing_subscription_id: null,
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCheckout({
    mode: "subscription",
    metadata: { clientId: "client-123" },
    customer: "cus_test_123",
    subscription: "sub_test_123",
  });

  assert.equal(
    updates.length,
    0,
    "Sandbox payments must not activate Live accounts"
  );
});
test("valid cancellation updates the correct customer", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async () => {
          throw new Error("Stripe should not be called");
        },
      },
    },

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_test_123",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCancellation({
    id: "sub_test_123",
    customer: "cus_test_123",
    livemode: false,
    metadata: { clientId: "client-123" },
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].clientId, "client-123");
  assert.equal(
    updates[0].billing.subscriptionStatus,
    "canceled"
  );
});
test("old cancellation cannot cancel a newer subscription", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async () => {
          throw new Error("Stripe should not be called");
        },
      },
    },

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_new",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCancellation({
    id: "sub_old",
    customer: "cus_test_123",
    livemode: false,
    metadata: { clientId: "client-123" },
  });

  assert.equal(
    updates.length,
    0,
    "An old cancellation must not affect the newer subscription"
  );
});

test("past-due subscription updates the correct customer", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async () => {
          throw new Error("Stripe should not be called");
        },
      },
    },

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_test_123",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processSubscriptionUpdate({
    id: "sub_test_123",
    customer: "cus_test_123",
    status: "past_due",
    livemode: false,
    metadata: { clientId: "client-123" },
    cancel_at_period_end: false,
    current_period_end: 1798761600,
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].clientId, "client-123");
  assert.equal(
    updates[0].billing.subscriptionStatus,
    "past_due"
  );
  assert.equal(
    updates[0].billing.billingSubscriptionId,
    "sub_test_123"
  );
});

test("old subscription update cannot affect a newer subscription", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async () => {
          throw new Error("Stripe should not be called");
        },
      },
    },

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_new",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processSubscriptionUpdate({
    id: "sub_old",
    customer: "cus_test_123",
    status: "active",
    livemode: false,
    metadata: { clientId: "client-123" },
    cancel_at_period_end: false,
  });

  assert.equal(
    updates.length,
    0,
    "An old subscription update must not change current billing"
  );
});


test("subscription update rejects the wrong Stripe customer", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async () => {
          throw new Error("Stripe should not be called");
        },
      },
    },

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: "cus_correct",
      billing_subscription_id: "sub_test_123",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processSubscriptionUpdate({
    id: "sub_test_123",
    customer: "cus_wrong",
    status: "active",
    livemode: false,
    metadata: { clientId: "client-123" },
  });

  assert.equal(
    updates.length,
    0,
    "A different Stripe customer must not update billing"
  );
});


test("active subscription cannot be replaced by another checkout", async () => {
  const updates = [];
  const retrievedSubscriptions = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async (id) => {
          retrievedSubscriptions.push(id);

          return {
            id,
            customer: "cus_test_123",
            status: "active",
            livemode: false,
            metadata: { clientId: "client-123" },
          };
        },
      },
    },

    getClientById: async () => ({
      id: "client-123",
      subscription_status: "active",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_existing",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCheckout({
    mode: "subscription",
    metadata: { clientId: "client-123" },
    customer: "cus_test_123",
    subscription: "sub_new",
  });

  assert.deepEqual(retrievedSubscriptions, [
    "sub_new",
    "sub_existing",
  ]);

  assert.equal(
    updates.length,
    0,
    "An active subscription must not be replaced"
  );
});

test("canceled customer can activate a new subscription", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async (id) => ({
          id,
          customer: "cus_returning",
          status: id === "sub_old" ? "canceled" : "active",
          livemode: false,
          metadata: { clientId: "client-123" },
        }),
      },
    },

    getClientById: async () => ({
      id: "client-123",
      subscription_status: "canceled",
      billing_customer_id: "cus_returning",
      billing_subscription_id: "sub_old",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCheckout({
    mode: "subscription",
    metadata: { clientId: "client-123" },
    customer: "cus_returning",
    subscription: "sub_new",
  });

  assert.equal(
    updates.length,
    1,
    "A canceled customer should be able to subscribe again"
  );

  assert.equal(updates[0].billing.subscriptionStatus, "active");
  assert.equal(updates[0].billing.billingCustomerId, "cus_returning");
  assert.equal(updates[0].billing.billingSubscriptionId, "sub_new");
});

test("old checkout cannot replace a newer active subscription", async () => {
  const updates = [];

  const processor = createStripeWebhookProcessor({
    isStripeLiveMode: false,

    stripe: {
      subscriptions: {
        retrieve: async (id) => ({
          id,
          customer: "cus_returning",
          status: "active",
          livemode: false,
          metadata: { clientId: "client-123" },
        }),
      },
    },

    getClientById: async () => ({
      id: "client-123",
      subscription_status: "active",
      billing_customer_id: "cus_returning",
      billing_subscription_id: "sub_new",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
    },
  });

  await processor.processCheckout({
    mode: "subscription",
    metadata: { clientId: "client-123" },
    customer: "cus_returning",
    subscription: "sub_old",
  });

  assert.equal(
    updates.length,
    0,
    "An older checkout must not replace an active subscription"
  );
});
