// We need to test getConfig with controlled env vars.
// Since getConfig is a singleton, we re-import fresh each test.

describe("getConfig", () => {
  const validEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    ENCRYPTION_KEY: "a".repeat(64),
    RAGEN_TOKEN_VAULT_SERVICE_SECRET: "s".repeat(32),
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    NODE_ENV: "test",
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns config when env vars are valid", async () => {
    vi.stubEnv("DATABASE_URL", validEnv.DATABASE_URL);
    vi.stubEnv("ENCRYPTION_KEY", validEnv.ENCRYPTION_KEY);
    vi.stubEnv("RAGEN_TOKEN_VAULT_SERVICE_SECRET", validEnv.RAGEN_TOKEN_VAULT_SERVICE_SECRET);
    vi.stubEnv("NODE_ENV", "test");

    const { getConfig } = await import("./config.js");
    const config = getConfig();

    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(config.ENCRYPTION_KEY).toBe(validEnv.ENCRYPTION_KEY);
    expect(config.PORT).toBe(3100); // default
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    vi.stubEnv("DATABASE_URL", validEnv.DATABASE_URL);
    vi.stubEnv("ENCRYPTION_KEY", validEnv.ENCRYPTION_KEY);
    vi.stubEnv("RAGEN_TOKEN_VAULT_SERVICE_SECRET", validEnv.RAGEN_TOKEN_VAULT_SERVICE_SECRET);
    vi.stubEnv("NODE_ENV", "test");

    const { getConfig } = await import("./config.js");
    const a = getConfig();
    const b = getConfig();
    expect(a).toBe(b);
  });

  it("exits process on invalid env vars", async () => {
    vi.stubEnv("DATABASE_URL", "not-a-url");
    vi.stubEnv("ENCRYPTION_KEY", "too-short");
    vi.stubEnv("RAGEN_TOKEN_VAULT_SERVICE_SECRET", "short");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getConfig } = await import("./config.js");
    getConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
