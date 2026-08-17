const crypto = require("crypto");

const SCRYPT_KEY_LENGTH = 64;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");

    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      (error, derivedKey) => {
        if (error) {
          return reject(error);
        }

        resolve({
          salt,
          hash: derivedKey.toString("hex"),
        });
      }
    );
  });
}

function verifyPassword(password, salt, storedHash) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      (error, derivedKey) => {
        if (error) {
          return reject(error);
        }

        const storedBuffer =
          Buffer.from(storedHash, "hex");

        if (
          storedBuffer.length !== derivedKey.length
        ) {
          return resolve(false);
        }

        resolve(
          crypto.timingSafeEqual(
            storedBuffer,
            derivedKey
          )
        );
      }
    );
  });
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionToken,
};