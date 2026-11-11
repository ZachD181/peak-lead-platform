
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("CSRF: rejects cross-origin authenticated logout", () => {
  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");

    const repository = require("./lib/repository");

    repository.getSession = async () => ({
      userId: "test-user",
      clientId: "test-client"
    });

    const handler = require("./api/index.js");

    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/logout";
    req.headers = {
      host: "localhost:3000",
      origin: "https://untrusted.example",
      cookie: "peak_session=test-session"
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

      assert.equal(status, 403, body);
    }

    run().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "",
      SANDBOX_DATABASE_URL: "",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
      RESEND_API_KEY: "",
      ENABLE_FOLLOW_UP_EMAILS: "false"
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("CSRF: accepts the configured Vercel Preview origin", () => {
  const script = `
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");

    const repository = require("./lib/repository");

    repository.deleteSession = async () => {};

    const handler = require("./api/index.js");
    const req = new EventEmitter();
    req.method = "POST";
    req.url = "/api/logout";
    req.headers = {
      host: "peak-lead-platform-abc123.vercel.app",
      origin: "https://peak-lead-platform-abc123.vercel.app",
      cookie: "peak_session=test-session"
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
    }

    run().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      VERCEL_ENV: "preview",
      VERCEL_URL: "peak-lead-platform-abc123.vercel.app",
      DATABASE_URL: "",
      SANDBOX_DATABASE_URL: "postgresql://test:test@localhost:5432/csrf_test",
      STRIPE_SECRET_KEY: "sk_test_12345678901234567890",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
      RESEND_API_KEY: "",
      ENABLE_FOLLOW_UP_EMAILS: "false"
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
