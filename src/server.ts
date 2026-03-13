import Fastify from "fastify";
import { serviceAuthHook } from "./auth/service-auth.js";
import { tokenRoutes } from "./routes/tokens.js";
import {
  googleOAuthRoutes,
  googleOAuthCallbackRoute,
} from "./routes/oauth-google.js";
import { healthRoutes } from "./routes/health.js";
import { logger } from "./services/logger.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 1_048_576, // 1 MiB
  });

  // Capture raw body for HMAC signature verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      const rawBody = typeof body === "string" ? body : body.toString();
      (req as unknown as { rawBody: string }).rawBody = rawBody;
      try {
        const parsed = rawBody ? JSON.parse(rawBody) : undefined;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Public routes — no auth required
  await app.register(healthRoutes);
  await app.register(googleOAuthCallbackRoute);

  // Authenticated routes — HMAC service auth
  await app.register(async (authenticatedApp) => {
    authenticatedApp.addHook("preHandler", serviceAuthHook);
    await authenticatedApp.register(tokenRoutes);
    await authenticatedApp.register(googleOAuthRoutes);
  });

  return app;
}
