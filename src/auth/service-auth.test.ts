import { describe, it, expect } from "vitest";
import { computeSignature } from "./service-auth.js";

const TEST_SECRET = "a".repeat(64);

describe("HMAC-SHA256 service auth", () => {
  it("produces consistent signatures for the same input", () => {
    const sig1 = computeSignature(TEST_SECRET, "1700000000", "GET", "/v1/tokens/cust1/GOOGLE", "");
    const sig2 = computeSignature(TEST_SECRET, "1700000000", "GET", "/v1/tokens/cust1/GOOGLE", "");
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different timestamps", () => {
    const sig1 = computeSignature(TEST_SECRET, "1700000000", "GET", "/v1/tokens/cust1/GOOGLE", "");
    const sig2 = computeSignature(TEST_SECRET, "1700000001", "GET", "/v1/tokens/cust1/GOOGLE", "");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different methods", () => {
    const sig1 = computeSignature(TEST_SECRET, "1700000000", "GET", "/v1/tokens/cust1/GOOGLE", "");
    const sig2 = computeSignature(TEST_SECRET, "1700000000", "PUT", "/v1/tokens/cust1/GOOGLE", "");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different paths", () => {
    const sig1 = computeSignature(TEST_SECRET, "1700000000", "GET", "/v1/tokens/cust1/GOOGLE", "");
    const sig2 = computeSignature(TEST_SECRET, "1700000000", "GET", "/v1/tokens/cust2/GOOGLE", "");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different bodies", () => {
    const sig1 = computeSignature(TEST_SECRET, "1700000000", "PUT", "/v1/tokens/cust1/GOOGLE", '{"access_token":"a"}');
    const sig2 = computeSignature(TEST_SECRET, "1700000000", "PUT", "/v1/tokens/cust1/GOOGLE", '{"access_token":"b"}');
    expect(sig1).not.toBe(sig2);
  });

  it("returns a 64-char hex string", () => {
    const sig = computeSignature(TEST_SECRET, "1700000000", "GET", "/test", "");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});
