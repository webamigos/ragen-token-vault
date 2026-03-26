import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const TEST_KEY = crypto.randomBytes(32).toString("hex");

// Mock dependencies
vi.mock("../db/client.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config.js", () => ({
  getConfig: vi.fn(() => ({ ENCRYPTION_KEY: TEST_KEY })),
}));

vi.mock("./audit-service.js", () => ({
  logAudit: vi.fn(),
}));

import { getDb } from "../db/client.js";
import { logAudit } from "./audit-service.js";
import {
  storeToken,
  retrieveToken,
  deleteToken,
  getTokenStatus,
  listCustomerTokens,
} from "./token-service.js";
import { encrypt } from "../crypto/encryption.js";

function createMockDb() {
  return {
    token: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

describe("token-service", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as never);
  });

  describe("storeToken", () => {
    it("encrypts sensitive fields and upserts", async () => {
      mockDb.token.upsert.mockResolvedValue({});

      await storeToken("cust1", "GOOGLE", {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        clientId: "client-id",
        clientSecret: "client-secret",
        tokenType: "Bearer",
        scopes: "email profile",
      }, "ragen-app");

      expect(mockDb.token.upsert).toHaveBeenCalledOnce();
      const call = mockDb.token.upsert.mock.calls[0]![0];

      // Verify sensitive fields are encrypted (not plaintext)
      expect(call.create.accessToken).not.toBe("access-123");
      expect(call.create.refreshToken).not.toBe("refresh-456");
      expect(call.create.clientId).not.toBe("client-id");
      expect(call.create.clientSecret).not.toBe("client-secret");

      // Non-sensitive fields remain as-is
      expect(call.create.tokenType).toBe("Bearer");
      expect(call.create.scopes).toBe("email profile");
      expect(call.create.customerId).toBe("cust1");
      expect(call.create.provider).toBe("GOOGLE");

      // Audit logged
      expect(logAudit).toHaveBeenCalledWith({
        customerId: "cust1",
        provider: "GOOGLE",
        action: "token_stored",
        callerService: "ragen-app",
      });
    });

    it("handles optional fields as null", async () => {
      mockDb.token.upsert.mockResolvedValue({});

      await storeToken("cust1", "GOOGLE", {
        accessToken: "access-123",
      }, "ragen-app");

      const call = mockDb.token.upsert.mock.calls[0]![0];
      expect(call.create.refreshToken).toBeNull();
      expect(call.create.clientId).toBeNull();
      expect(call.create.clientSecret).toBeNull();
    });
  });

  describe("retrieveToken", () => {
    it("decrypts and returns token data", async () => {
      mockDb.token.findUnique.mockResolvedValue({
        accessToken: encrypt("access-123", TEST_KEY),
        refreshToken: encrypt("refresh-456", TEST_KEY),
        clientId: null,
        clientSecret: null,
        codeVerifier: null,
        tokenType: "Bearer",
        expiresAt: null,
        scopes: "email",
        tokenUri: null,
      });

      const result = await retrieveToken("cust1", "GOOGLE", "ragen-app");

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe("access-123");
      expect(result!.refreshToken).toBe("refresh-456");
      expect(result!.clientId).toBeNull();
      expect(result!.tokenType).toBe("Bearer");

      expect(logAudit).toHaveBeenCalledWith({
        customerId: "cust1",
        provider: "GOOGLE",
        action: "token_retrieved",
        callerService: "ragen-app",
      });
    });

    it("returns null when token not found", async () => {
      mockDb.token.findUnique.mockResolvedValue(null);

      const result = await retrieveToken("cust1", "GOOGLE", "ragen-app");
      expect(result).toBeNull();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe("deleteToken", () => {
    it("returns true and logs audit when token deleted", async () => {
      mockDb.token.deleteMany.mockResolvedValue({ count: 1 });

      const result = await deleteToken("cust1", "GOOGLE", "ragen-app");
      expect(result).toBe(true);
      expect(logAudit).toHaveBeenCalledWith({
        customerId: "cust1",
        provider: "GOOGLE",
        action: "token_deleted",
        callerService: "ragen-app",
      });
    });

    it("returns false when token not found", async () => {
      mockDb.token.deleteMany.mockResolvedValue({ count: 0 });

      const result = await deleteToken("cust1", "GOOGLE", "ragen-app");
      expect(result).toBe(false);
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe("getTokenStatus", () => {
    it("returns metadata with isExpired=false for future expiry", async () => {
      const future = new Date(Date.now() + 3600_000);
      mockDb.token.findUnique.mockResolvedValue({
        provider: "GOOGLE",
        tokenType: "Bearer",
        expiresAt: future,
        scopes: "email",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      });

      const result = await getTokenStatus("cust1", "GOOGLE");
      expect(result).not.toBeNull();
      expect(result!.isExpired).toBe(false);
      expect(result!.provider).toBe("GOOGLE");
    });

    it("returns isExpired=true for past expiry", async () => {
      const past = new Date(Date.now() - 3600_000);
      mockDb.token.findUnique.mockResolvedValue({
        provider: "GOOGLE",
        tokenType: "Bearer",
        expiresAt: past,
        scopes: null,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      });

      const result = await getTokenStatus("cust1", "GOOGLE");
      expect(result!.isExpired).toBe(true);
    });

    it("returns isExpired=false when no expiresAt", async () => {
      mockDb.token.findUnique.mockResolvedValue({
        provider: "GOOGLE",
        tokenType: "Bearer",
        expiresAt: null,
        scopes: null,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      });

      const result = await getTokenStatus("cust1", "GOOGLE");
      expect(result!.isExpired).toBe(false);
    });

    it("returns null when token not found", async () => {
      mockDb.token.findUnique.mockResolvedValue(null);
      const result = await getTokenStatus("cust1", "GOOGLE");
      expect(result).toBeNull();
    });
  });

  describe("listCustomerTokens", () => {
    it("returns mapped metadata array", async () => {
      const now = new Date();
      mockDb.token.findMany.mockResolvedValue([
        {
          provider: "GOOGLE",
          tokenType: "Bearer",
          expiresAt: new Date(Date.now() + 3600_000),
          scopes: "email",
          createdAt: now,
          updatedAt: now,
        },
        {
          provider: "GITHUB",
          tokenType: "Bearer",
          expiresAt: null,
          scopes: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await listCustomerTokens("cust1");
      expect(result).toHaveLength(2);
      expect(result[0]!.provider).toBe("GOOGLE");
      expect(result[0]!.isExpired).toBe(false);
      expect(result[1]!.provider).toBe("GITHUB");
      expect(result[1]!.isExpired).toBe(false);
    });

    it("returns empty array when no tokens", async () => {
      mockDb.token.findMany.mockResolvedValue([]);
      const result = await listCustomerTokens("cust1");
      expect(result).toEqual([]);
    });
  });
});
