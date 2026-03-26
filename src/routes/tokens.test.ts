import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import Fastify from "fastify";
import { tokenRoutes } from "./tokens.js";

const TEST_KEY = crypto.randomBytes(32).toString("hex");

vi.mock("../db/client.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../config.js", () => ({
  getConfig: vi.fn(() => ({ ENCRYPTION_KEY: TEST_KEY })),
}));

vi.mock("../services/audit-service.js", () => ({
  logAudit: vi.fn(),
}));

import { getDb } from "../db/client.js";
import { encrypt } from "../crypto/encryption.js";

function createMockDb() {
  return {
    token: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

async function buildTestApp() {
  const app = Fastify();
  await app.register(tokenRoutes);
  return app;
}

describe("token routes", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    vi.mocked(getDb).mockReturnValue(mockDb as never);
  });

  describe("PUT /v1/tokens/:customerId/:provider", () => {
    it("stores a token and returns ok", async () => {
      const app = await buildTestApp();

      const res = await app.inject({
        method: "PUT",
        url: "/v1/tokens/cust1/GOOGLE",
        payload: { access_token: "my-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(mockDb.token.upsert).toHaveBeenCalledOnce();
    });

    it("rejects missing access_token", async () => {
      const app = await buildTestApp();

      const res = await app.inject({
        method: "PUT",
        url: "/v1/tokens/cust1/GOOGLE",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Invalid request body");
    });

    it("rejects invalid provider format", async () => {
      const app = await buildTestApp();

      const res = await app.inject({
        method: "PUT",
        url: "/v1/tokens/cust1/invalid provider!",
        payload: { access_token: "token" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /v1/tokens/:customerId/:provider", () => {
    it("returns decrypted token", async () => {
      mockDb.token.findUnique.mockResolvedValue({
        accessToken: encrypt("access-123", TEST_KEY),
        refreshToken: null,
        clientId: null,
        clientSecret: null,
        codeVerifier: null,
        tokenType: "Bearer",
        expiresAt: null,
        scopes: "email",
        tokenUri: null,
      });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/tokens/cust1/GOOGLE",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.access_token).toBe("access-123");
      expect(body.token_type).toBe("Bearer");
    });

    it("returns 404 when token not found", async () => {
      mockDb.token.findUnique.mockResolvedValue(null);

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/tokens/cust1/GOOGLE",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/tokens/:customerId/:provider", () => {
    it("deletes token and returns ok", async () => {
      mockDb.token.deleteMany.mockResolvedValue({ count: 1 });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "DELETE",
        url: "/v1/tokens/cust1/GOOGLE",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it("returns 404 when token not found", async () => {
      mockDb.token.deleteMany.mockResolvedValue({ count: 0 });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "DELETE",
        url: "/v1/tokens/cust1/GOOGLE",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /v1/tokens/:customerId/:provider/status", () => {
    it("returns token status", async () => {
      const now = new Date();
      mockDb.token.findUnique.mockResolvedValue({
        provider: "GOOGLE",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() + 3600_000),
        scopes: "email",
        createdAt: now,
        updatedAt: now,
      });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/tokens/cust1/GOOGLE/status",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe("GOOGLE");
      expect(body.is_expired).toBe(false);
    });
  });

  describe("GET /v1/tokens/:customerId", () => {
    it("lists customer tokens", async () => {
      const now = new Date();
      mockDb.token.findMany.mockResolvedValue([
        {
          provider: "GOOGLE",
          tokenType: "Bearer",
          expiresAt: null,
          scopes: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/tokens/cust1",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tokens).toHaveLength(1);
      expect(body.tokens[0].provider).toBe("GOOGLE");
    });
  });
});
