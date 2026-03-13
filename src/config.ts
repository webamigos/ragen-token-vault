import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/i, "Must be a 64-char hex string"),
  RAGEN_AUTH_SERVICE_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z
    .string()
    .optional()
    .default("http://localhost:3100/v1/oauth/google/callback"),
  PORT: z.coerce.number().optional().default(3100),
  HOST: z.string().optional().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .default("development"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  TARGET_ENV: z.string().optional().default("local"),
  GIT_COMMIT_SHA: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error("Invalid environment variables:", result.error.format());
      process.exit(1);
    }
    _config = result.data;
  }
  return _config;
}
