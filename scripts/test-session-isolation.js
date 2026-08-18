const crypto = require("crypto");

const {
  getClientBySlug,
  getUserByEmail,
  createSession,
  createLead,
  updateLead,
} = require("../lib/repository");

async function main() {
  const demoClient = await getClientBySlug("peak-demo");
  const testClient = await getClientBySlug(
    "test-plumbing-company"
  );

  const testOwner = await getUserByEmail(
    "owner@testplumbing.com"
  );

  if (!demoClient || !testClient || !testOwner) {
    throw new Error(
      "Required test client/user data is missing."
    );
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + 60 * 60 * 1000
  ).toISOString();

  const session = await createSession({
    id: crypto.randomBytes(32).toString("hex"),
    userId: testOwner.id,
    clientId: testClient.id,
    expiresAt,
    createdAt,
  });

  const demoLead = await createLead({
    id: crypto.randomUUID(),
    clientId: demoClient.id,

    name: "Protected Demo Lead",
    email: "protected@example.com",
    phone: "",
    location: "",

    urgency: "Immediately",
    readiness: "Ready to buy",
    notes: "Cross-tenant security test",

    source: "Security Test",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmTerm: "",
    utmContent: "",
    gclid: "",
    landingPage: "",
    referrer: "",
    firstVisit: createdAt,

    score: 90,
    tier: "High Priority",
    stage: "New",
    recommendedAction: "Contact immediately",

    createdAt,
    updatedAt: createdAt,
  });

  const attackResult = await updateLead(
    session.clientId,
    demoLead.id,
    {
      stage: "Closed",
      updatedAt: new Date().toISOString(),
    }
  );

  console.log("\nSESSION ISOLATION TEST");
  console.log("----------------------");

  console.log(
    "Attacker client:",
    session.clientId
  );

  console.log(
    "Target lead client:",
    demoClient.id
  );

  console.log(
    "Cross-tenant update result:",
    attackResult
  );

  if (attackResult === null) {
    console.log(
      "\nPASS: Cross-tenant lead update was blocked."
    );

    process.exit(0);
  }

  console.error(
    "\nFAIL: Cross-tenant update was allowed."
  );

  process.exit(1);
}

main().catch((error) => {
  console.error(
    "Session isolation test failed:",
    error
  );

  process.exit(1);
});