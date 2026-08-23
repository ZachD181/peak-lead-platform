const {
  getUserByEmail,
  updateUserPassword,
} = require("../lib/repository");

const {
  hashPassword,
} = require("../lib/auth");

async function main() {
  const email = "owner@testplumbing.com";

  // Temporary development password
  const newPassword = "PeakTest2026!";

  const user = await getUserByEmail(email);

  if (!user) {
    throw new Error(
      `User not found: ${email}`
    );
  }

  const {
    salt,
    hash,
  } = await hashPassword(newPassword);

  const updatedUser =
    await updateUserPassword(
      user.id,
      salt,
      hash
    );

  if (!updatedUser) {
    throw new Error(
      "Password update failed."
    );
  }

  console.log("Password reset successful.");
  console.log(`Email: ${email}`);
  console.log(`Password: ${newPassword}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });