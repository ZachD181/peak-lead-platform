
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStripeWebhookProcessor,
} = require("../lib/stripeWebhookProcessor");

test("valid checkout activates the correct customer", async () => {
  const updates = [];
  let transactionCompleted = false;

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

    getCheckoutReservation: async () => ({
      id: "reservation-123",
      client_id: "client-123",
      checkout_session_id: "cs_test_123",
      status: "pending",
    }),

    finalizeCheckoutBilling: async (
  clientId,
  reservationId,
  checkoutSessionId,
  billing
) => {
    updates.push({
    clientId,
    reservationId,
    checkoutSessionId,
    billing,
  });

  transactionCompleted = true;

  return { id: clientId };
},
  });

  await processor.processCheckout({
    id: "cs_test_123",
    mode: "subscription",
    status: "complete",
    livemode: false,
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
  assert.equal(transactionCompleted, true);
assert.equal(updates[0].reservationId, "reservation-123");
assert.equal(updates[0].checkoutSessionId, "cs_test_123");
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
      subscription_status: "active",
      billing_customer_id: "cus_original",
      billing_subscription_id: "sub_original",
    }),

    getCheckoutReservation: async () => ({
      id: "reservation-123",
      client_id: "client-123",
      checkout_session_id: "cs_test_different",
      status: "pending",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
      return { id: clientId };
    },

    completeCheckoutReservation: async () => {
      throw new Error("Blocked checkout must not complete its reservation");
    },
  });

  const checkout = {
    id: "cs_test_different",
    mode: "subscription",
    status: "complete",
    livemode: false,
    metadata: { clientId: "client-123" },
    customer: "cus_original",
    subscription: "sub_different",
  };

  await assert.rejects(
    () => processor.processCheckout(checkout),
    /subscription|already|different|duplicate|conflict/i
  );

  assert.equal(
    updates.length,
    0,
    "A different subscription must not overwrite the existing one"
  );
});
test("duplicate checkout keeps the same billing identity", async () => {
  const updates = [];
  let reservationStatus = "pending";
  let completionCount = 0;

  let client = {
    id: "client-123",
    subscription_status: "inactive",
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

    getCheckoutReservation: async () => ({
      id: "reservation-123",
      client_id: "client-123",
      checkout_session_id: "cs_test_duplicate",
      status: reservationStatus,
    }),

    finalizeCheckoutBilling: async (
  clientId,
  reservationId,
  checkoutSessionId,
  billing
) => {
  assert.equal(clientId, "client-123");
  assert.equal(reservationId, "reservation-123");
  assert.equal(checkoutSessionId, "cs_test_duplicate");

  assert.equal(
    reservationStatus,
    "pending",
    "A completed reservation must not be finalized twice"
  );

  updates.push(billing);

  client = {
    ...client,
    subscription_status: billing.subscriptionStatus,
    billing_customer_id: billing.billingCustomerId,
    billing_subscription_id: billing.billingSubscriptionId,
  };

  reservationStatus = "completed";
  completionCount++;

  return client;
},
  });

  const checkout = {
    id: "cs_test_duplicate",
    mode: "subscription",
    status: "complete",
    livemode: false,
    metadata: { clientId: "client-123" },
    customer: "cus_test_123",
    subscription: "sub_test_123",
  };

  await processor.processCheckout(checkout);
  await processor.processCheckout(checkout);

  assert.equal(client.billing_customer_id, "cus_test_123");
  assert.equal(client.billing_subscription_id, "sub_test_123");

  assert.equal(
    completionCount,
    1,
    "The reservation should only be completed once"
  );

  assert.ok(
    updates.length <= 2,
    "A duplicate webhook must not create additional billing changes"
  );
});
test("Sandbox subscription cannot activate a Live account", async () => {
  const updates = [];
  let transactionCompleted = false;

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

    getCheckoutReservation: async () => ({
      id: "reservation-123",
      client_id: "client-123",
      checkout_session_id: "cs_test_sandbox",
      status: "pending",
    }),

   finalizeCheckoutBilling: async (
  clientId,
  reservationId,
  checkoutSessionId,
  billing
) => {
  updates.push({
    clientId,
    reservationId,
    checkoutSessionId,
    billing,
  });

  transactionCompleted = true;

  return { id: clientId };
},


  });

  await assert.rejects(
    () =>
      processor.processCheckout({
        id: "cs_test_sandbox",
        mode: "subscription",
        status: "complete",
        livemode: false,
        metadata: { clientId: "client-123" },
        customer: "cus_test_123",
        subscription: "sub_test_123",
      }),
    /environment|validation|livemode/i
  );

  assert.equal(
    updates.length,
    0,
    "Sandbox payments must not activate Live accounts"
  );

  assert.equal(
  transactionCompleted,
  false,
  "A rejected Sandbox Checkout must not finalize billing"
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
  return { id: clientId };
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
    retrieve: async (id) => ({
      id,
      customer: "cus_test_123",
      status: "past_due",
      livemode: false,
      metadata: { clientId: "client-123" },
      cancel_at_period_end: false,
      current_period_end: 1798761600,
    }),
  },
},

    getClientById: async () => ({
      id: "client-123",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_test_123",
    }),

    updateClientBilling: async (clientId, billing) => {
  updates.push({ clientId, billing });
  return { id: clientId };
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
  let reservationCompleted = false;

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

    getCheckoutReservation: async () => ({
      id: "reservation-123",
      client_id: "client-123",
      checkout_session_id: "cs_test_new",
      status: "pending",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
      return { id: clientId };
    },

    completeCheckoutReservation: async () => {
      reservationCompleted = true;
      return true;
    },
  });

  await assert.rejects(
    () =>
      processor.processCheckout({
        id: "cs_test_new",
        mode: "subscription",
        status: "complete",
        livemode: false,
        metadata: { clientId: "client-123" },
        customer: "cus_test_123",
        subscription: "sub_new",
      }),
    /subscription|already|different|duplicate|conflict/i
  );

  assert.ok(
    retrievedSubscriptions.includes("sub_new"),
    "The new subscription should be verified with Stripe"
  );

  assert.equal(
    updates.length,
    0,
    "An active subscription must not be replaced"
  );

  assert.equal(
    reservationCompleted,
    false,
    "A conflicting Checkout must not complete its reservation"
  );
});

test("canceled customer can activate a new subscription", async () => {
  const updates = [];
  let transactionCompleted = false;

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

    getCheckoutReservation: async () => ({
      id: "reservation-returning",
      client_id: "client-123",
      checkout_session_id: "cs_test_returning",
      status: "pending",
    }),

   finalizeCheckoutBilling: async (
  clientId,
  reservationId,
  checkoutSessionId,
  billing
) => {
  updates.push({
    clientId,
    reservationId,
    checkoutSessionId,
    billing,
  });

  transactionCompleted = true;

  return { id: clientId };
},
  });

  await processor.processCheckout({
    id: "cs_test_returning",
    mode: "subscription",
    status: "complete",
    livemode: false,
    metadata: { clientId: "client-123" },
    customer: "cus_returning",
    subscription: "sub_new",
  });

 assert.equal(
  transactionCompleted,
  true,
  "Returning customer's Checkout should finalize billing"
);

assert.equal(
  updates[0].reservationId,
  "reservation-returning"
);

assert.equal(
  updates[0].checkoutSessionId,
  "cs_test_returning"
);

assert.equal(
  updates[0].billing.expectedCustomerId,
  "cus_returning"
);

assert.equal(
  updates[0].billing.expectedSubscriptionId,
  "sub_old"
);

  assert.equal(updates[0].clientId, "client-123");
  assert.equal(updates[0].billing.subscriptionStatus, "active");
  assert.equal(updates[0].billing.billingCustomerId, "cus_returning");
  assert.equal(updates[0].billing.billingSubscriptionId, "sub_new");

  assert.equal(
  transactionCompleted,
  true,
  "A successful returning customer's Checkout should finalize billing"
);
});

test("old checkout cannot replace a newer active subscription", async () => {
  const updates = [];
  let reservationCompleted = false;

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

    getCheckoutReservation: async () => ({
      id: "reservation-old",
      client_id: "client-123",
      checkout_session_id: "cs_test_old",
      status: "pending",
    }),

    updateClientBilling: async (clientId, billing) => {
      updates.push({ clientId, billing });
      return { id: clientId };
    },

    completeCheckoutReservation: async () => {
      reservationCompleted = true;
      return true;
    },
  });

  await assert.rejects(
    () =>
      processor.processCheckout({
        id: "cs_test_old",
        mode: "subscription",
        status: "complete",
        livemode: false,
        metadata: { clientId: "client-123" },
        customer: "cus_returning",
        subscription: "sub_old",
      }),
    /subscription|already|different|duplicate|conflict/i
  );

  assert.equal(
    updates.length,
    0,
    "An older checkout must not replace an active subscription"
  );

  assert.equal(
    reservationCompleted,
    false,
    "An older checkout must not complete its reservation"
  );
});