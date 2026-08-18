const crypto = require("crypto");

const {
  createClient,
  createUser,
  updateScoringRulesByClient,
} = require("../lib/repository");

const {
  hashPassword,
} = require("../lib/auth");

function clean(value = "") {
  return String(value).trim();
}

function slugify(value = "") {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const [
    companyName,
    ownerName,
    ownerEmail,
    ownerPassword,
    industry = "",
  ] = process.argv.slice(2);

  if (
    !companyName ||
    !ownerName ||
    !ownerEmail ||
    !ownerPassword
  ) {
    console.log(`
Usage:

node scripts/create-client.js \
"Company Name" \
"Owner Name" \
"owner@example.com" \
"StrongPassword123!" \
"Industry"
    `);

    process.exit(1);
  }

  const now = new Date().toISOString();

  const clientId = crypto.randomUUID();

  const client = await createClient({
    id: clientId,
    name: clean(companyName),
    slug: slugify(companyName),
    industry: clean(industry),
    status: "active",
    plan: "standard",
    subscriptionStatus: "trial",
    createdAt: now,
    updatedAt: now,
  });

  const passwordData = await hashPassword(
    ownerPassword
  );

  const owner = await createUser({
    id: crypto.randomUUID(),
    clientId: client.id,
    name: clean(ownerName),
    email: clean(ownerEmail).toLowerCase(),
    role: "owner",
    status: "active",

    passwordSalt:
      passwordData.Salt,

    passwordHash:
      passwordData.Hash,

    createdAt: now,
    updatedAt: now,
  });

  const scoringRules =
    await updateScoringRulesByClient(
      client.id,
      {
        immediately: 30,
        within30Days: 25,
        oneToThreeMonths: 18,
        threeToSixMonths: 10,
        researching: 4,

        readyToBuy: 25,
        activelyComparing: 20,
        gettingEstimates: 14,
        earlyResearch: 6,

        phone: 8,
        notes: 4,

        highPriorityThreshold: 75,
        qualifiedThreshold: 55,
      }
    );

  console.log("\nPeak client created successfully.\n");

  console.log({
    client: {
      id: client.id,
      name: client.name,
      slug: client.slug,
    },

    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
    },

    scoringRules,
  });
}

main().catch((error) => {
  console.error(
    "Unable to create Peak client:",
    error
  );

  process.exit(1);
});