const crypto = require("crypto");

const {
  getClientBySlug,
  createLead,
  getLeadsByClient,
} = require("../lib/repository");

async function main() {
  const demoClient = await getClientBySlug(
    "peak-demo"
  );

  const testClient = await getClientBySlug(
    "test-plumbing-company"
  );

  if (!demoClient || !testClient) {
    throw new Error(
      "Both test clients must exist before running this test."
    );
  }

  console.log("Demo client:", demoClient.id);
  console.log("Test client:", testClient.id);

  const now = new Date().toISOString();

  const testLead = await createLead({
    id: crypto.randomUUID(),

    clientId: testClient.id,

    name: "Tenant Isolation Test Lead",
    email: "isolation@testplumbing.com",
    phone: "555-555-0100",
    location: "Denver, CO",

    urgency: "Immediately",
    readiness: "Ready to buy",
    notes: "Tenant isolation security test.",

    source: "Security Test",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmTerm: "",
    utmContent: "",
    gclid: "",
    landingPage: "",
    referrer: "",
    firstVisit: now,

    score: 90,
    tier: "High Priority",
    stage: "New",
    recommendedAction: "Contact immediately",

    createdAt: now,
    updatedAt: now,
  });

  const testClientLeads =
    await getLeadsByClient(testClient.id);

  const demoClientLeads =
    await getLeadsByClient(demoClient.id);

  const visibleToCorrectClient =
    testClientLeads.some(
      (lead) => lead.id === testLead.id
    );

  const leakedToOtherClient =
    demoClientLeads.some(
      (lead) => lead.id === testLead.id
    );

  console.log("\nTENANT ISOLATION TEST");
  console.log("---------------------");

  console.log(
    "Visible to Test Plumbing:",
    visibleToCorrectClient
  );

  console.log(
    "Visible to Peak Demo:",
    leakedToOtherClient
  );

  if (
    visibleToCorrectClient === true &&
    leakedToOtherClient === false
  ) {
    console.log(
      "\nPASS: Tenant isolation is working."
    );

    process.exit(0);
  }

  console.error(
    "\nFAIL: Tenant isolation is not working correctly."
  );

  process.exit(1);
}

main().catch((error) => {
  console.error(
    "Tenant isolation test failed:",
    error
  );

  process.exit(1);
});