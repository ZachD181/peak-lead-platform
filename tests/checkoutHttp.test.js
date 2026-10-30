
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("Checkout rejects unauthenticated requests", () => {
  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/create-checkout-session";
    req.headers = {
      host: "localhost:3000"
    };

    let status = null;
    let body = "";

    const res = {
      writeHead(code) {
        status = code;
      },
      setHeader() {},
      end(data) {
        body = data || "";
      }
    };

    async function run() {
      await handler(req, res);

      assert.equal(status, 401);
      assert.match(body, /Authentication required/);

      console.log("Checkout authentication test passed");
    }

    run().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(
    process.execPath,
    ["-e", script],
    {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "",
        STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
        STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
        RESEND_API_KEY: "",
        ENABLE_FOLLOW_UP_EMAILS: "false"
      },
      encoding: "utf8"
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout
  );
});

test("Canceled customer can restart Checkout without another trial", () => {
  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");

    const repository = require("./lib/repository");

    repository.getSession = async () => ({
      userId: "user-123",
      clientId: "client-123"
    });

    repository.getClientById = async () => ({
      id: "client-123",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_old_123",
      trial_used: true
    });

    repository.getUserById = async () => ({
      id: "user-123",
      email: "customer@example.com"
    });

    repository.getCheckoutReservation = async () => ({
      id: "reservation-old",
      status: "completed"
    });

    repository.claimCheckoutReservation = async () => ({
      id: "reservation-new",
      client_id: "client-123"
    });

    repository.saveCheckoutSessionId = async () => true;

    const stripePath = require.resolve("stripe");

    let checkoutParams = null;

    require.cache[stripePath] = {
      id: stripePath,
      filename: stripePath,
      loaded: true,
      exports: class FakeStripe {
        constructor() {
          this.subscriptions = {
            retrieve: async () => ({
              id: "sub_old_123",
              status: "canceled",
              customer: "cus_test_123",
              livemode: false,
              metadata: { clientId: "client-123" }
            })
          };

          this.checkout = {
            sessions: {
              create: async (params) => {
                checkoutParams = params;

                return {
                  id: "cs_test_new",
                  url: "https://checkout.stripe.com/test",
                  expires_at: 2000000000
                };
              }
            }
          };
        }
      }
    };

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/create-checkout-session";
    req.headers = {
      host: "localhost:3000",
      cookie: "peak_session=test-session-123"
    };

    let status = null;
    let body = "";

    const res = {
      writeHead(code) {
        status = code;
      },
      setHeader() {},
      end(data) {
        body = data || "";
      }
    };

  async function run() {
  await handler(req, res);

  assert.equal(status, 200, body);

  assert.ok(
    checkoutParams,
    "Stripe Checkout should be created"
  );

  assert.equal(
    checkoutParams.customer,
    "cus_test_123"
  );

  assert.equal(
    checkoutParams.subscription_data.trial_period_days,
    undefined,
    "Returning customers must not receive another trial"
  );
}
    run().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(
    process.execPath,
    ["-e", script],
    {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "",
        STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
        STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
        RESEND_API_KEY: "",
        ENABLE_FOLLOW_UP_EMAILS: "false"
      },
      encoding: "utf8"
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout
  );
});

test("Active customer cannot start duplicate Checkout", () => {
  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");

    const repository = require("./lib/repository");

    repository.getSession = async () => ({
      userId: "user-123",
      clientId: "client-123"
    });

    repository.getClientById = async () => ({
      id: "client-123",
      billing_customer_id: "cus_test_123",
      billing_subscription_id: "sub_old_123",
      trial_used: true
    });

    repository.getUserById = async () => ({
      id: "user-123",
      email: "customer@example.com"
    });

    repository.getCheckoutReservation = async () => ({
      id: "reservation-old",
      status: "completed"
    });

    repository.claimCheckoutReservation = async () => ({
      id: "reservation-new",
      client_id: "client-123"
    });

    repository.saveCheckoutSessionId = async () => true;

    const stripePath = require.resolve("stripe");

    let checkoutParams = null;

    require.cache[stripePath] = {
      id: stripePath,
      filename: stripePath,
      loaded: true,
      exports: class FakeStripe {
        constructor() {
          this.subscriptions = {
            retrieve: async () => ({
              id: "sub_old_123",
              status: "active",
              customer: "cus_test_123",
              livemode: false,
              metadata: { clientId: "client-123" }
            })
          };

          this.checkout = {
            sessions: {
              create: async (params) => {
                checkoutParams = params;

                return {
                  id: "cs_test_new",
                  url: "https://checkout.stripe.com/test",
                  expires_at: 2000000000
                };
              }
            }
          };
        }
      }
    };

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/create-checkout-session";
    req.headers = {
      host: "localhost:3000",
      cookie: "peak_session=test-session-123"
    };

    let status = null;
    let body = "";

    const res = {
      writeHead(code) {
        status = code;
      },
      setHeader() {},
      end(data) {
        body = data || "";
      }
    };

 async function run() {
  await handler(req, res);

  assert.equal(status, 409, body);

  assert.match(
    body,
    /already have an active subscription or free trial/
  );

  assert.equal(
    checkoutParams,
    null,
    "Stripe Checkout must not be created for active subscribers"
  );
}

    run().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(
    process.execPath,
    ["-e", script],
    {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "",
        STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
        STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
        RESEND_API_KEY: "",
        ENABLE_FOLLOW_UP_EMAILS: "false"
      },
      encoding: "utf8"
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout
  );
});

