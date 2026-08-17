const crypto = require("crypto");

const {
  getClientBySlug,
  getUserByEmail,
  createUser,
} = require("../lib/repository");

const { hashPassword } = require("../lib/auth");

async function main() {
  const name = process.argv[2];
  const email = process.argv[3];
  const password = process.argv[4];

  if (!name || !email || !password) {
    console.log(
      'Usage: node scripts/create-admin.js "Your Name" "you@example.com" "YourPassword"'
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.log(
      "Password must be at least 12 characters long."
    );
    process.exit(1);
  }

  const existingUser = await getUserByEmail(email);

  if (existingUser) {
    console.log("A user with that email already exists.");
    process.exit(1);
  }

  const client = await getClientBySlug("peak-demo");

  if (!client) {
    console.log("Peak Demo Company was not found.");
    process.exit(1);
  }

  const credentials = await hashPassword(password);

  const now = new Date().toISOString();

  const user = await createUser({
    id: crypto.randomUUID(),
    clientId: client.id,
    name,
    email: email.toLowerCase(),
    role: "owner",
    passwordSalt: credentials.salt,
    passwordHash: credentials.hash,
    createdAt: now,
    updatedAt: now,
  });

  console.log("");
  console.log("Peak admin account created.");
  console.log(`Name: ${user.name}`);
  console.log(`Email: ${user.email}`);
  console.log(`Role: ${user.role}`);
  console.log(`Client: ${client.name}`);
}

main().catch((error) => {
  console.error("Unable to create admin:", error);
  process.exit(1);
});