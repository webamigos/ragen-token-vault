import crypto from "node:crypto";

const TEST_KEY = crypto.randomBytes(32).toString("hex");

vi.mock("../db/client.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config.js", () => ({
  getConfig: vi.fn(() => ({
    ENCRYPTION_KEY: TEST_KEY,
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:3100/v1/oauth/google/callback",
  })),
}));

vi.mock("./audit-service.js", () => ({
  logAudit: vi.fn(),
}));

vi.mock("./token-service.js", () => ({
  storeToken: vi.fn(),
}));

vi.mock("./logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getDb } from "../db/client.js";
import { generateAuthUrl, handleCallback, refreshAccessToken } from "./google-oauth-service.js";

function createMockDb() {
  return {
    oAuthPendingState: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    token: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("google-oauth-service", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as never);
  });

  describe("generateAuthUrl", () => {
    it("returns a Google OAuth URL with correct params", async () => {
      const url = await generateAuthUrl({
        customerId: "cust1",
        scopes: ["email", "profile"],
      });

      const parsed = new URL(url);
      expect(parsed.hostname).toBe("accounts.google.com");
      expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsed.searchParams.get("scope")).toBe("email profile");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("access_type")).toBe("offline");
      expect(parsed.searchParams.get("prompt")).toBe("consent");
      expect(parsed.searchParams.get("state")).toBeTruthy();
    });

    it("stores pending state in the database", async () => {
      await generateAuthUrl({
        customerId: "cust1",
        scopes: ["email"],
      });

      expect(mockDb.oAuthPendingState.create).toHaveBeenCalledOnce();
      const createCall = mockDb.oAuthPendingState.create.mock.calls[0]![0];
      expect(createCall.data.customerId).toBe("cust1");
      expect(createCall.data.provider).toBe("GOOGLE");
      expect(createCall.data.scopes).toBe("email");
    });

    it("cleans up expired pending states", async () => {
      await generateAuthUrl({
        customerId: "cust1",
        scopes: ["email"],
      });

      expect(mockDb.oAuthPendingState.deleteMany).toHaveBeenCalledOnce();
    });
  });

  describe("handleCallback", () => {
    it("throws on invalid state", async () => {
      mockDb.oAuthPendingState.findUnique.mockResolvedValue(null);

      await expect(handleCallback("code123", "bad-state")).rejects.toThrow(
        "Invalid or expired OAuth state",
      );
    });

    it("throws on expired state", async () => {
      mockDb.oAuthPendingState.findUnique.mockResolvedValue({
        state: "test-state",
        customerId: "cust1",
        provider: "GOOGLE",
        redirectUri: null,
        codeVerifier: null,
        scopes: "email",
        expiresAt: new Date(Date.now() - 60_000), // expired
      });

      await expect(handleCallback("code123", "test-state")).rejects.toThrow(
        "OAuth state expired",
      );
    });
  });

  describe("refreshAccessToken", () => {
    it("throws when token not found", async () => {
      mockDb.token.findUnique.mockResolvedValue(null);

      await expect(refreshAccessToken("cust1", "GOOGLE", "ragen-app")).rejects.toThrow(
        "Token not found",
      );
    });

    it("throws when no refresh token available", async () => {
      mockDb.token.findUnique.mockResolvedValue({
        refreshToken: null,
      });

      await expect(refreshAccessToken("cust1", "GOOGLE", "ragen-app")).rejects.toThrow(
        "No refresh token available",
      );
    });
  });
});
