
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("webhook rejects requests without a Stripe signature", () => {
  const apiPath = path.join(
    __dirname,
    "..",
    "api",
    "index.js"
  );

  const source = fs.readFileSync(apiPath, "utf8");

  assert.match(
    source,
    /if\s*\(!signature\)\s*\{[\s\S]*?sendJson\(res,\s*400/,
    "Webhook must reject requests without a signature"
  );

  assert.match(
    source,
    /stripe\.webhooks\.constructEvent\(/,
    "Webhook must verify Stripe signatures"
  );
});

test("HTTP tests can create an isolated environment", () => {
  const isolatedEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "",
    STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
    STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
    RESEND_API_KEY: "",
    ENABLE_FOLLOW_UP_EMAILS: "false",
  };

  assert.equal(isolatedEnv.DATABASE_URL, "");
  assert.equal(isolatedEnv.NODE_ENV, "test");
  assert.equal(isolatedEnv.RESEND_API_KEY, "");
  assert.equal(
    isolatedEnv.STRIPE_SECRET_KEY.startsWith("sk_test_"),
    true
  );
});

test("actual webhook rejects a request without a signature", () => {
  const projectRoot = path.join(__dirname, "..");

  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/stripe/webhook";
    req.headers = {};

    let status = null;
    let body = "";

    const res = {
      writeHead(code) {
        status = code;
      },
      setHeader() {},
      end(data) {
        body = data || "";
      },
    };

    handler(req, res).then(() => {
      assert.equal(status, 400);
      assert.match(body, /Missing Stripe signature/);
      console.log("HTTP webhook signature test passed");
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
      DATABASE_URL: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
      RESEND_API_KEY: "",
      ENABLE_FOLLOW_UP_EMAILS: "false",
    },
    encoding: "utf8",
    timeout: 10000,
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message
  );

  assert.match(
    result.stdout,
    /HTTP webhook signature test passed/
  );
});

test("actual webhook rejects an invalid Stripe signature", () => {
  const projectRoot = path.join(__dirname, "..");

  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/stripe/webhook";
    req.headers = {
      "stripe-signature": "invalid_signature"
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
      },
    };

    handler(req, res).then(() => {
      assert.equal(status, 400);
      console.log("Invalid Stripe signature rejected");
    }).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });

    process.nextTick(() => {
      req.emit("data", Buffer.from(
        JSON.stringify({ type: "checkout.session.completed" })
      ));
      req.emit("end");
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      NODE_ENV: "test",
      DATABASE_URL: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
      RESEND_API_KEY: "",
      ENABLE_FOLLOW_UP_EMAILS: "false",
    },
    encoding: "utf8",
    timeout: 10000,
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message
  );

  assert.match(
    result.stdout,
    /Invalid Stripe signature rejected/
  );
});

test("actual webhook accepts a valid Stripe signature", () => {
  const projectRoot = path.join(__dirname, "..");

  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");
    const Stripe = require("stripe");

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const payload = JSON.stringify({
      id: "evt_local_test",
      type: "test.webhook.ping",
      data: { object: {} }
    });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret
    });

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/stripe/webhook";
    req.headers = {
      "stripe-signature": signature
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
      },
    };

    handler(req, res).then(() => {
      assert.equal(status, 200);
      assert.equal(JSON.parse(body).received, true);
      console.log("Valid Stripe webhook accepted");
    }).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });

    process.nextTick(() => {
      req.emit("data", Buffer.from(payload));
      req.emit("end");
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      NODE_ENV: "test",
      DATABASE_URL: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
      RESEND_API_KEY: "",
      ENABLE_FOLLOW_UP_EMAILS: "false",
    },
    encoding: "utf8",
    timeout: 10000,
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message
  );

  assert.match(
    result.stdout,
    /Valid Stripe webhook accepted/
  );
});

test("webhook returns HTTP 500 when billing processing fails", () => {
  const projectRoot = path.join(__dirname, "..");

  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");
    const Stripe = require("stripe");

    // Replace the webhook processor before loading the API.
    const processorPath = require.resolve(
      "./lib/stripeWebhookProcessor"
    );

    require.cache[processorPath] = {
      id: processorPath,
      filename: processorPath,
      loaded: true,
      exports: {
        createStripeWebhookProcessor: () => ({
          processCheckout: async () => {
            throw new Error("Simulated database failure");
          },
          processSubscriptionUpdate: async () => {},
          processCancellation: async () => {},
        }),
      },
    };

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const payload = JSON.stringify({
      id: "evt_simulated_failure",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_failure",
          mode: "subscription",
          metadata: { clientId: "test-client" }
        }
      }
    });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/stripe/webhook";
    req.headers = { "stripe-signature": signature };

    let status = null;
    let body = "";

    const res = {
      writeHead(code) {
        status = code;
      },
      setHeader() {},
      end(data) {
        body = data || "";
      },
    };

    handler(req, res).then(() => {
      assert.equal(status, 500);
      assert.match(body, /Unable to process Stripe webhook/);
      console.log("Billing failure correctly returned HTTP 500");
    }).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });

    process.nextTick(() => {
      req.emit("data", Buffer.from(payload));
      req.emit("end");
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      NODE_ENV: "test",
      DATABASE_URL: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
      RESEND_API_KEY: "",
      ENABLE_FOLLOW_UP_EMAILS: "false",
    },
    encoding: "utf8",
    timeout: 10000,
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message
  );

  assert.match(
    result.stdout,
    /Billing failure correctly returned HTTP 500/
  );
});
