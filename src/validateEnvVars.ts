import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/i, "Must be a 64-char hex string"),
  RAGEN_TOKEN_VAULT_SERVICE_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z
    .string()
    .optional()
    .default("http://localhost:3100/v1/oauth/google/callback"),
  PORT: z.coerce.number().optional().default(3100),
  HOST: z.string().optional().default("::"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .default("development"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().optional().default("ragen-token-vault"),
  TARGET_ENV: z.string().optional().default("local"),
  GIT_COMMIT_SHA: z.string().optional(),
});

export const validateEnvVars = () => envSchema.safeParse(process.env);
