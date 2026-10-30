const { createStripeWebhookProcessor } =
  require("../lib/stripeWebhookProcessor");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("billing updates require matching Stripe identities", () => {
  const repositoryPath = path.join(
    __dirname,
    "..",
    "lib",
    "repository.js"
  );

  const source = fs.readFileSync(repositoryPath, "utf8");

  const start = source.indexOf(
    "async function updateClientBilling("
  );

  const end = source.indexOf(
    "async function createPasswordResetToken(",
    start
  );

  assert.ok(start >= 0, "Billing update function must exist");
  assert.ok(end > start, "Billing update function must be complete");

  const billingCode = source.slice(start, end);

  assert.match(
    billingCode,
    /billing_customer_id\s*=\s*\$7/,
    "SQL must check the expected Stripe customer ID"
  );

  assert.match(
    billingCode,
    /billing_subscription_id\s+IS NOT DISTINCT FROM\s+\$8::text/i,
    "SQL must check the expected Stripe subscription ID"
  );

  assert.match(
    billingCode,
    /expectedCustomerId\s*\?\?\s*null/,
    "Expected customer ID must be passed to SQL"
  );

  assert.match(
    billingCode,
    /expectedSubscriptionId\s*\?\?\s*null/,
    "Expected subscription ID must be passed to SQL"
  );
});

test("billing update sends expected identity to PostgreSQL", () => {
  const projectRoot = path.join(__dirname, "..");

  const script = `
    const assert = require("node:assert/strict");

    let capturedQuery = null;

    const pgPath = require.resolve("pg");

    require.cache[pgPath] = {
      id: pgPath,
      filename: pgPath,
      loaded: true,
      exports: {
        Pool: class FakePool {
          async query(sql, values) {
            capturedQuery = { sql, values };
            return { rows: [] };
          }
        }
      }
    };

    const { updateClientBilling } = require("./lib/repository");

    updateClientBilling("client-1", {
      subscriptionStatus: "canceled",
      billingCustomerId: "cus_123",
      billingSubscriptionId: "sub_123",
      expectedCustomerId: "cus_123",
      expectedSubscriptionId: "sub_123"
    }).then(() => {
      assert.ok(capturedQuery, "SQL query should run");

      assert.equal(capturedQuery.values[0], "client-1");
      assert.equal(capturedQuery.values[6], "cus_123");
      assert.equal(capturedQuery.values[7], "sub_123");

      assert.match(
        capturedQuery.sql,
        /billing_customer_id\\s*=\\s*\\$7/
      );

      assert.match(
        capturedQuery.sql,
      /billing_subscription_id\\s+IS NOT DISTINCT FROM\\s+\\$8::text/i
      );

      console.log("Billing identity parameters verified");
    }).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      NODE_ENV: "test",
      DATABASE_URL: "postgres://fake:fake@localhost/fake",
      RESEND_API_KEY: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890"
    },
    encoding: "utf8",
    timeout: 10000
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message
  );

  assert.match(
    result.stdout,
    /Billing identity parameters verified/
  );
});

test("outdated cancellation cannot change a newer subscription", () => {
  const projectRoot = path.join(__dirname, "..");

  const script = `
    const assert = require("node:assert/strict");

    const currentClient = {
      id: "client-1",
      subscription_status: "active",
      billing_customer_id: "cus_123",
      billing_subscription_id: "sub_new"
    };

    const pgPath = require.resolve("pg");

    require.cache[pgPath] = {
      id: pgPath,
      filename: pgPath,
      loaded: true,
      exports: {
        Pool: class FakePool {
          async query(sql, values) {
            // Simulate PostgreSQL's identity conditions.
            const expectedCustomerId = values[6];
            const expectedSubscriptionId = values[7];

            if (
              expectedCustomerId !== currentClient.billing_customer_id ||
              expectedSubscriptionId !== currentClient.billing_subscription_id
            ) {
              return { rows: [] };
            }

            currentClient.subscription_status = values[1];
            return { rows: [currentClient] };
          }
        }
      }
    };

    const { updateClientBilling } = require("./lib/repository");

    updateClientBilling("client-1", {
      subscriptionStatus: "canceled",
      billingCustomerId: "cus_123",
      billingSubscriptionId: "sub_old",
      expectedCustomerId: "cus_123",
      expectedSubscriptionId: "sub_old"
    }).then((result) => {
      assert.equal(result, null);
      assert.equal(currentClient.subscription_status, "active");
      assert.equal(currentClient.billing_subscription_id, "sub_new");

      console.log("Outdated cancellation safely rejected");
    }).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      NODE_ENV: "test",
      DATABASE_URL: "postgres://fake:fake@localhost/fake",
      RESEND_API_KEY: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890"
    },
    encoding: "utf8",
    timeout: 10000
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message
  );

  assert.match(
    result.stdout,
    /Outdated cancellation safely rejected/
  );
});

test("matching billing identity allows a valid update", () => {
  const projectRoot = path.join(__dirname, "..");

  const script = `
    const assert = require("node:assert/strict");

    const currentClient = {
      id: "client-1",
      subscription_status: "past_due",
      billing_customer_id: "cus_123",
      billing_subscription_id: "sub_123"
    };

    const pgPath = require.resolve("pg");

    require.cache[pgPath] = {
      id: pgPath,
      filename: pgPath,
      loaded: true,
      exports: {
        Pool: class FakePool {
          async query(sql, values) {
            const expectedCustomerId = values[6];
            const expectedSubscriptionId = values[7];

            if (
              expectedCustomerId !== currentClient.billing_customer_id ||
              expectedSubscriptionId !== currentClient.billing_subscription_id
            ) {
              return { rows: [] };
            }

            currentClient.subscription_status = values[1];
            return { rows: [{ ...currentClient }] };
          }
        }
      }
    };

    const { updateClientBilling } = require("./lib/repository");

    updateClientBilling("client-1", {
      subscriptionStatus: "active",
      billingCustomerId: "cus_123",
      billingSubscriptionId: "sub_123",
      expectedCustomerId: "cus_123",
      expectedSubscriptionId: "sub_123"
    }).then((result) => {
      assert.ok(result);
      assert.equal(result.subscription_status, "active");
      assert.equal(
        result.billing_subscription_id,
        "sub_123"
      );

      console.log("Valid subscription update accepted");
    }).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      NODE_ENV: "test",
      DATABASE_URL: "postgres://fake:fake@localhost/fake",
      RESEND_API_KEY: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890"
    },
    encoding: "utf8",
    timeout: 10000
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message
  );

  assert.match(
    result.stdout,
    /Valid subscription update accepted/
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
      id: "reservation-123",
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
    updates.length,
    1,
    "A canceled customer should be able to subscribe again"
  );

  assert.equal(updates[0].billing.subscriptionStatus, "active");
  assert.equal(updates[0].billing.billingCustomerId, "cus_returning");
  assert.equal(updates[0].billing.billingSubscriptionId, "sub_new");
  assert.equal(updates[0].billing.expectedSubscriptionId, "sub_old");
 assert.equal(transactionCompleted, true);
assert.equal(updates[0].reservationId, "reservation-123");
assert.equal(updates[0].checkoutSessionId, "cs_test_returning");
assert.equal(
  updates[0].billing.expectedCustomerId,
  "cus_returning"
);
});
