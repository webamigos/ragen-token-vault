import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { encrypt, decrypt } from "./encryption.js";

const TEST_KEY = crypto.randomBytes(32).toString("hex");

describe("AES-256-GCM encryption", () => {
  it("encrypts and decrypts a string", () => {
    const plaintext = "my-secret-token-12345";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-text";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, TEST_KEY)).toBe(plaintext);
    expect(decrypt(b, TEST_KEY)).toBe(plaintext);
  });

  it("stores ciphertext in iv:data:tag format", () => {
    const encrypted = encrypt("test", TEST_KEY);
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // IV should be 24 hex chars (12 bytes)
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/);
    // Auth tag should be 32 hex chars (16 bytes)
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test", TEST_KEY);
    const parts = encrypted.split(":");
    // Tamper with the ciphertext
    const tampered = `${parts[0]}:${Buffer.from("tampered").toString("base64")}:${parts[2]}`;
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });

  it("throws on wrong key", () => {
    const encrypted = encrypt("test", TEST_KEY);
    const wrongKey = crypto.randomBytes(32).toString("hex");
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it("throws on invalid format", () => {
    expect(() => decrypt("not-valid", TEST_KEY)).toThrow(
      "Invalid ciphertext format",
    );
  });

  it("handles empty string", () => {
    const encrypted = encrypt("", TEST_KEY);
    expect(decrypt(encrypted, TEST_KEY)).toBe("");
  });

  it("handles unicode text", () => {
    const plaintext = "Zażółć gęślą jaźń 🔐";
    const encrypted = encrypt(plaintext, TEST_KEY);
    expect(decrypt(encrypted, TEST_KEY)).toBe(plaintext);
  });
});
