import Fastify from "fastify";
import { serviceAuthHook } from "./auth/service-auth.js";
import { tokenRoutes } from "./routes/tokens.js";
import {
  googleOAuthRoutes,
  googleOAuthCallbackRoute,
} from "./routes/oauth-google.js";
import { healthRoutes } from "./routes/health.js";
import { logger } from "./services/logger.js";

export async function buildServer() {
  const app = Fastify({
    logger: false,
    loggerInstance: logger,
  });

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
