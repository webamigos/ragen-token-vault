vi.mock("../db/client.js", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db/client.js";
import { logAudit } from "./audit-service.js";

describe("audit-service", () => {
  const mockCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue({
      auditLog: { create: mockCreate },
    } as never);
  });

  it("creates an audit log entry", async () => {
    mockCreate.mockResolvedValue({});

    await logAudit({
      customerId: "cust1",
      provider: "GOOGLE",
      action: "token_stored",
      callerService: "ragen-app",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        customerId: "cust1",
        provider: "GOOGLE",
        action: "token_stored",
        callerService: "ragen-app",
        metadata: undefined,
      },
    });
  });

  it("passes metadata when provided", async () => {
    mockCreate.mockResolvedValue({});

    await logAudit({
      customerId: "cust1",
      provider: "GOOGLE",
      action: "oauth_started",
      callerService: "ragen-token-vault",
      metadata: { scopes: ["email"] },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        customerId: "cust1",
        provider: "GOOGLE",
        action: "oauth_started",
        callerService: "ragen-token-vault",
        metadata: { scopes: ["email"] },
      },
    });
  });
});
