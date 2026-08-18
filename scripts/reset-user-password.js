const {
  getUserByEmail,
  updateUserPassword,
} = require("../lib/repository");

const {
  hashPassword,
} = require("../lib/auth");

async function main() {
  const [email, newPassword] =
    process.argv.slice(2);

  if (!email || !newPassword) {
    console.log(`
Usage:

node scripts/reset-user-password.js \
"owner@example.com" \
"NewPassword123!"
    `);

    process.exit(1);
  }

  const user = await getUserByEmail(
    email.toLowerCase()
  );

  if (!user) {
    throw new Error("User not found.");
  }

  const passwordData =
    await hashPassword(newPassword);

  await updateUserPassword(
    user.id,
    passwordData.salt,
    passwordData.hash
  );

  console.log(
    "Password updated successfully."
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});