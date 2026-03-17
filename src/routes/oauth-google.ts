import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  generateAuthUrl,
  handleCallback,
  refreshAccessToken,
} from "../services/google-oauth-service.js";

interface AuthorizeQuery {
  customer_id: string;
  scopes: string;
  redirect_uri?: string;
  provider?: string;
}

interface CallbackQuery {
  code: string;
  state: string;
  error?: string;
}

interface RefreshBody {
  customer_id: string;
  provider?: string;
}

/**
 * OAuth callback route — no service auth (browser redirect from Google).
 */
export async function googleOAuthCallbackRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get<{ Querystring: CallbackQuery }>(
    "/v1/oauth/google/callback",
    async (request, reply) => {
      const { code, state, error } = request.query;

      if (error) {
        return reply.code(400).send({ error: `OAuth error: ${error}` });
      }

      if (!code || !state) {
        return reply.code(400).send({ error: "Missing code or state" });
      }

      try {
        const result = await handleCallback(code, state);

        if (result.redirectUri) {
          const redirectUrl = new URL(result.redirectUri);
          redirectUrl.searchParams.set("provider", result.provider);
          redirectUrl.searchParams.set("status", "success");
          return reply.redirect(redirectUrl.toString());
        }

        return reply.code(200).send({
          ok: true,
          customer_id: result.customerId,
          provider: result.provider,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "OAuth callback failed";
        return reply.code(400).send({ error: message });
      }
    },
  );
}

/**
 * Authenticated OAuth routes — require service-to-service HMAC auth.
 */
export async function googleOAuthRoutes(app: FastifyInstance): Promise<void> {
  // GET /v1/oauth/google/authorize — Start OAuth flow
  app.get<{ Querystring: AuthorizeQuery }>(
    "/v1/oauth/google/authorize",
    async (request, reply) => {
      const { customer_id, scopes, redirect_uri, provider } = request.query;

      if (!customer_id || !scopes) {
        return reply
          .code(400)
          .send({ error: "customer_id and scopes are required" });
      }

      const authUrl = await generateAuthUrl({
        customerId: customer_id,
        scopes: scopes.split(","),
        redirectUri: redirect_uri,
        provider,
      });

      return reply.redirect(authUrl);
    },
  );

  // POST /v1/oauth/google/refresh — Force refresh access token
  app.post<{ Body: RefreshBody }>(
    "/v1/oauth/google/refresh",
    async (request, reply) => {
      const { customer_id, provider } = request.body;
      const callerService =
        (request as FastifyRequest & { serviceName?: string }).serviceName ??
        "unknown";

      if (!customer_id) {
        return reply.code(400).send({ error: "customer_id is required" });
      }

      try {
        const result = await refreshAccessToken(
          customer_id,
          provider ?? "GOOGLE",
          callerService,
        );

        // Map camelCase to snake_case API response
        return reply.code(200).send({
          access_token: result.accessToken,
          expires_at: result.expiresAt,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Token refresh failed";
        return reply.code(400).send({ error: message });
      }
    },
  );
}
