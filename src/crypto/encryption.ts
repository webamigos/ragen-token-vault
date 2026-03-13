import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns "{iv_hex}:{ciphertext_b64}:{auth_tag_hex}"
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${encrypted.toString("base64")}:${authTag.toString("hex")}`;
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Input format: "{iv_hex}:{ciphertext_b64}:{auth_tag_hex}"
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivHex, encryptedB64, authTagHex] = parts;
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex!, "hex");
  const encrypted = Buffer.from(encryptedB64!, "base64");
  const authTag = Buffer.from(authTagHex!, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
