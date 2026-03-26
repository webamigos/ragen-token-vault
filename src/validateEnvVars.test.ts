import { describe, it, expect } from "vitest";
import { envSchema } from "./validateEnvVars.js";

describe("envSchema", () => {
  const validEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    ENCRYPTION_KEY: "a".repeat(64),
    RAGEN_TOKEN_VAULT_SERVICE_SECRET: "s".repeat(32),
  };

  it("accepts valid minimal env", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3100);
      expect(result.data.HOST).toBe("::");
      expect(result.data.NODE_ENV).toBe("development");
      expect(result.data.OTEL_SERVICE_NAME).toBe("ragen-token-vault");
      expect(result.data.TARGET_ENV).toBe("local");
    }
  });

  it("rejects invalid DATABASE_URL", () => {
    const result = envSchema.safeParse({ ...validEnv, DATABASE_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects short ENCRYPTION_KEY", () => {
    const result = envSchema.safeParse({ ...validEnv, ENCRYPTION_KEY: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects non-hex ENCRYPTION_KEY", () => {
    const result = envSchema.safeParse({ ...validEnv, ENCRYPTION_KEY: "g".repeat(64) });
    expect(result.success).toBe(false);
  });

  it("rejects short RAGEN_TOKEN_VAULT_SERVICE_SECRET", () => {
    const result = envSchema.safeParse({ ...validEnv, RAGEN_TOKEN_VAULT_SERVICE_SECRET: "short" });
    expect(result.success).toBe(false);
  });

  it("coerces PORT to number", () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: "8080" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
    }
  });

  it("rejects invalid NODE_ENV", () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });
});
