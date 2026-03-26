import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/generated/**",
        "src/instrument.ts",
        "src/index.ts",
        "src/services/logger.ts",
        "src/services/otel-logger.ts",
      ],
    },
  },
});
