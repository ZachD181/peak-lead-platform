const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Checkout reservations must safely support returning customers", () => {
  const repositoryPath = path.join(
    __dirname,
    "..",
    "lib",
    "repository.js"
  );

  const source = fs.readFileSync(repositoryPath, "utf8");

  const start = source.indexOf(
    "async function claimCheckoutReservation("
  );

  const end = source.indexOf(
    "async function releaseCheckoutReservation(",
    start
  );

  assert.ok(start >= 0, "Reservation claim function must exist");
  assert.ok(end > start, "Reservation claim function must be complete");

  const claimCode = source.slice(start, end);

  assert.match(
    claimCode,
    /ON CONFLICT\s*\(client_id\)/i,
    "Concurrent reservation claims must use PostgreSQL conflict protection"
  );

  assert.match(
    claimCode,
    /DO UPDATE/i,
    "Completed reservations must be reusable for eligible returning customers"
  );

  assert.match(
    claimCode,
    /status\s*=\s*'completed'/i,
    "Only completed reservations may be replaced"
  );

  assert.match(
    claimCode,
    /RETURNING\s+id/i,
    "Successful claims must return the reservation ID"
  );
});
test("Checkout reservation claims handle success and conflicts", async () => {
  const { spawnSync } = require("node:child_process");

  const script = `
    const assert = require("node:assert/strict");

    const pgPath = require.resolve("pg");

    let databaseResult = {
      rows: [{
        id: "reservation-123",
        client_id: "client-123"
      }]
    };

    const queries = [];

    require.cache[pgPath] = {
      id: pgPath,
      filename: pgPath,
      loaded: true,
      exports: {
        Pool: class FakePool {
          async query(sql, values) {
            queries.push({ sql, values });
            return databaseResult;
          }
        }
      }
    };

    const { claimCheckoutReservation } =
      require("./lib/repository");

    async function run() {
      const first = await claimCheckoutReservation("client-123");

      assert.equal(first.id, "reservation-123");
      assert.equal(first.client_id, "client-123");

      databaseResult = { rows: [] };

      const blocked = await claimCheckoutReservation("client-123");

      assert.equal(
        blocked,
        null,
        "A conflicting pending reservation must be rejected"
      );

      assert.equal(queries.length, 2);

      assert.deepEqual(
        queries[0].values,
        ["client-123"]
      );

      assert.match(
        queries[0].sql,
        /ON CONFLICT/i
      );

      assert.match(
        queries[0].sql,
        /WHERE checkout_reservations.status = 'completed'/i
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
        DATABASE_URL: "postgres://fake:fake@localhost:5432/fake"
      },
      encoding: "utf8"
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || "Reservation test failed"
  );
});
test("Checkout billing finalization uses a database transaction", () => {
  const repositoryPath = path.join(
    __dirname,
    "..",
    "lib",
    "repository.js"
  );

  const source = fs.readFileSync(repositoryPath, "utf8");

  const start = source.indexOf(
    "async function finalizeCheckoutBilling("
  );

  const end = source.indexOf(
    "\nasync function ",
    start + 1
  );

  assert.ok(
    start >= 0,
    "finalizeCheckoutBilling must exist"
  );

  const transactionCode = source.slice(
    start,
    end > start ? end : undefined
  );

  assert.match(
    transactionCode,
    /db\.connect\(\)/,
    "Transaction must use a dedicated PostgreSQL connection"
  );

  assert.match(
    transactionCode,
    /BEGIN/,
    "Transaction must begin before modifying billing"
  );

  assert.match(
    transactionCode,
    /COMMIT/,
    "Transaction must commit successful changes"
  );

  assert.match(
    transactionCode,
    /ROLLBACK/,
    "Transaction must roll back failed changes"
  );

  assert.match(
    transactionCode,
    /checkout_reservations/,
    "Transaction must validate the Checkout reservation"
  );

  assert.match(
    transactionCode,
    /billing_subscription_id/,
    "Transaction must verify the existing billing identity"
  );
});
test("Checkout billing rolls back if reservation completion fails", () => {
  const { spawnSync } = require("node:child_process");

  const script = `
    const assert = require("node:assert/strict");

    const queries = [];
    let released = false;

    const connection = {
      async query(sql) {
        const statement = sql.trim();
        queries.push(statement);

        if (statement === "BEGIN" ||
            statement === "ROLLBACK" ||
            statement === "COMMIT") {
          return { rows: [], rowCount: 0 };
        }

        if (statement.includes("SELECT id") &&
            statement.includes("checkout_reservations")) {
          return {
            rows: [{ id: "reservation-123" }],
            rowCount: 1
          };
        }

        if (statement.includes("UPDATE clients")) {
          return {
            rows: [{ id: "client-123" }],
            rowCount: 1
          };
        }

        if (statement.includes("UPDATE checkout_reservations")) {
          return { rows: [], rowCount: 0 };
        }

        throw new Error("Unexpected SQL: " + statement);
      },

      release() {
        released = true;
      }
    };

    const pgPath = require.resolve("pg");

    require.cache[pgPath] = {
      id: pgPath,
      filename: pgPath,
      loaded: true,
      exports: {
        Pool: class FakePool {
          async connect() {
            return connection;
          }
        }
      }
    };

    const { finalizeCheckoutBilling } =
      require("./lib/repository");

    async function run() {
      await assert.rejects(
        () => finalizeCheckoutBilling(
          "client-123",
          "reservation-123",
          "cs_test_123",
          {
            subscriptionStatus: "active",
            billingCustomerId: "cus_test_123",
            billingSubscriptionId: "sub_test_123",
            expectedSubscriptionId: null
          }
        ),
        /reservation could not be completed/i
      );

      assert.equal(queries[0], "BEGIN");

      assert.ok(
        queries.some(sql => sql.includes("UPDATE clients")),
        "Billing update should be attempted"
      );

      assert.ok(
        queries.some(sql =>
          sql.includes("UPDATE checkout_reservations")
        ),
        "Reservation completion should be attempted"
      );

      assert.ok(
        queries.includes("ROLLBACK"),
        "Failed transaction must roll back"
      );

      assert.equal(
        queries.includes("COMMIT"),
        false,
        "Failed transaction must not commit"
      );

      assert.equal(
        released,
        true,
        "Database connection must be released"
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
        DATABASE_URL: "postgres://fake:fake@localhost:5432/fake"
      },
      encoding: "utf8",
      timeout: 10000
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message || "Rollback test failed"
  );
});
test("Checkout billing commits when reservation completion succeeds", () => {
    const { spawnSync } = require("node:child_process");
  const script = `
    const assert = require("node:assert/strict");

    const queries = [];
    let released = false;

    const connection = {
      async query(sql) {
        const statement = sql.trim();
        queries.push(statement);

        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(statement)) {
          return { rows: [], rowCount: 0 };
        }

        if (statement.includes("SELECT id") &&
            statement.includes("checkout_reservations")) {
          return {
            rows: [{ id: "reservation-123" }],
            rowCount: 1
          };
        }

        if (statement.includes("UPDATE clients")) {
          return {
            rows: [{ id: "client-123", subscription_status: "active" }],
            rowCount: 1
          };
        }

        if (statement.includes("UPDATE checkout_reservations")) {
          return {
            rows: [{ id: "reservation-123" }],
            rowCount: 1
          };
        }

        throw new Error("Unexpected SQL: " + statement);
      },

      release() {
        released = true;
      }
    };

    const pgPath = require.resolve("pg");

    require.cache[pgPath] = {
      id: pgPath,
      filename: pgPath,
      loaded: true,
      exports: {
        Pool: class FakePool {
          async connect() {
            return connection;
          }
        }
      }
    };

    const { finalizeCheckoutBilling } =
      require("./lib/repository");

    async function run() {
      const result = await finalizeCheckoutBilling(
        "client-123",
        "reservation-123",
        "cs_test_123",
        {
          subscriptionStatus: "active",
          billingCustomerId: "cus_test_123",
          billingSubscriptionId: "sub_test_123",
          expectedSubscriptionId: null
        }
      );

      assert.equal(result.id, "client-123");
      assert.equal(result.subscription_status, "active");

      assert.equal(queries[0], "BEGIN");

      assert.ok(
        queries.some(sql => sql.includes("UPDATE clients"))
      );

      assert.ok(
        queries.some(sql =>
          sql.includes("UPDATE checkout_reservations")
        )
      );

      assert.ok(queries.includes("COMMIT"));
      assert.equal(queries.includes("ROLLBACK"), false);
      assert.equal(released, true);

      assert.ok(
        queries.indexOf("COMMIT") >
        queries.findIndex(sql =>
          sql.includes("UPDATE checkout_reservations")
        ),
        "Commit must happen after reservation completion"
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
        DATABASE_URL: "postgres://fake:fake@localhost:5432/fake"
      },
      encoding: "utf8",
      timeout: 10000
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.error?.message || "Commit test failed"
  );
});
test("Completed Checkout reservations require a canceled subscription before reuse", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "api", "index.js"),
    "utf8"
  );

  const start = source.indexOf(
    "async function handleCreateCheckoutSession("
  );

  assert.ok(
    start >= 0,
    "Checkout endpoint must exist"
  );

  const end = source.indexOf(
    "\nasync function ",
    start + 1
  );

  const checkoutCode = source.slice(
    start,
    end > start ? end : undefined
  );

  assert.match(
    checkoutCode,
    /existingSubscription\?\.status\s*===\s*["']canceled["']/,
    "Returning customers must have a canceled Stripe subscription"
  );

  assert.match(
    checkoutCode,
    /reservation\.status\s*===\s*["']completed["']/,
    "Completed reservations must be handled explicitly"
  );

  assert.match(
    checkoutCode,
    /claimCheckoutReservation\(client\.id\)/,
    "Returning customers must use the protected reservation claim"
  );
});