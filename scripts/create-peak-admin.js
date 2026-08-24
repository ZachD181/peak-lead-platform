require("dotenv").config();
const crypto = require("crypto");

const {
  createUser,
  getUserByEmail,
} = require("../lib/repository");

const {
  hashPassword,
} = require("../lib/auth");

async function main() {
  const [
    name,
    email,
    password,
  ] = process.argv.slice(2);

  if (!name || !email || !password) {
    console.log(`
Usage:

node scripts/create-peak-admin.js \
"Your Name" \
"you@example.com" \
"StrongPassword123!"
    `);

    process.exit(1);
  }

  const normalizedEmail =
    String(email).trim().toLowerCase();

  const existing =
    await getUserByEmail(normalizedEmail);

  if (existing) {
    throw new Error(
      "A user with that email already exists."
    );
  }

  const passwordData =
    await hashPassword(password);

  const now = new Date().toISOString();

  const admin = await createUser({
    id: crypto.randomUUID(),

    clientId: null,

    name: String(name).trim(),

    email: normalizedEmail,

    role: "peak_admin",
    status: "active",

    passwordSalt: passwordData.salt,
    passwordHash: passwordData.hash,

    createdAt: now,
    updatedAt: now,
  });

  console.log(
    "\nPeak administrator created successfully.\n"
  );

  console.log({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });
}

main().catch((error) => {
  console.error(
    "Unable to create Peak administrator:",
    error.message
  );

  process.exit(1);
});