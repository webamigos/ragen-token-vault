import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeSignature } from "./service-auth.js";

const TEST_SECRET = "s".repeat(64);

vi.mock("../config.js", () => ({
  getConfig: vi.fn(() => ({
    RAGEN_TOKEN_VAULT_SERVICE_SECRET: TEST_SECRET,
  })),
}));

import { serviceAuthHook } from "./service-auth.js";

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    method: "GET",
    url: "/v1/tokens/cust1/GOOGLE",
    rawBody: "",
    ...overrides,
  } as never;
}

function createMockReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as never as { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

describe("serviceAuthHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects request without Authorization header", async () => {
    const reply = createMockReply();
    await serviceAuthHook(createMockRequest(), reply as never);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Missing Authorization header" });
  });

  it("rejects invalid Authorization header format", async () => {
    const reply = createMockReply();
    await serviceAuthHook(
      createMockRequest({ headers: { authorization: "Bearer abc123" } }),
      reply as never,
    );
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Invalid Authorization header format" });
  });

  it("rejects expired timestamp", async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = computeSignature(TEST_SECRET, String(oldTs), "GET", "/v1/tokens/cust1/GOOGLE", "");
    const reply = createMockReply();

    await serviceAuthHook(
      createMockRequest({
        headers: { authorization: `HMAC-SHA256 ts=${oldTs},sig=${sig}` },
      }),
      reply as never,
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Request timestamp out of range" });
  });

  it("rejects invalid signature", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const badSig = "a".repeat(64);
    const reply = createMockReply();

    await serviceAuthHook(
      createMockRequest({
        headers: { authorization: `HMAC-SHA256 ts=${ts},sig=${badSig}` },
      }),
      reply as never,
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Invalid signature" });
  });

  it("passes with valid signature and attaches serviceName", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = computeSignature(TEST_SECRET, ts, "GET", "/v1/tokens/cust1/GOOGLE", "");
    const reply = createMockReply();
    const request = createMockRequest({
      headers: {
        authorization: `HMAC-SHA256 ts=${ts},sig=${sig}`,
        "x-service-name": "ragen-app",
      },
    });

    await serviceAuthHook(request, reply as never);

    // Should NOT have sent a 401
    expect(reply.code).not.toHaveBeenCalled();
    // Service name should be attached
    expect((request as Record<string, unknown>).serviceName).toBe("ragen-app");
  });

  it("defaults serviceName to 'unknown' when header missing", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = computeSignature(TEST_SECRET, ts, "GET", "/v1/tokens/cust1/GOOGLE", "");
    const reply = createMockReply();
    const request = createMockRequest({
      headers: {
        authorization: `HMAC-SHA256 ts=${ts},sig=${sig}`,
      },
    });

    await serviceAuthHook(request, reply as never);

    expect(reply.code).not.toHaveBeenCalled();
    expect((request as Record<string, unknown>).serviceName).toBe("unknown");
  });
});
