import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  storeToken,
  retrieveToken,
  deleteToken,
  getTokenStatus,
  listCustomerTokens,
} from "../services/token-service.js";

const tokenParamsSchema = z.object({
  customerId: z.string().min(1).max(255),
  provider: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
});

const customerParamsSchema = z.object({
  customerId: z.string().min(1).max(255),
});

const storeTokenBodySchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  code_verifier: z.string().optional(),
  token_type: z.string().optional(),
  expires_at: z.string().optional(),
  scopes: z.string().optional(),
  token_uri: z.string().optional(),
});

function getCallerService(request: FastifyRequest): string {
  return (request as FastifyRequest & { serviceName?: string }).serviceName ?? "unknown";
}

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  // PUT /v1/tokens/:customerId/:provider — Store/update token
  app.put<{ Params: { customerId: string; provider: string }; Body: z.infer<typeof storeTokenBodySchema> }>(
    "/v1/tokens/:customerId/:provider",
    async (request, reply) => {
      const params = tokenParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid path parameters", details: params.error.format() });
      }
      const body = storeTokenBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body", details: body.error.format() });
      }

      const { customerId, provider } = params.data;
      const callerService = getCallerService(request);

      // Map snake_case API body to camelCase StoreTokenInput
      await storeToken(customerId, provider, {
        accessToken: body.data.access_token,
        refreshToken: body.data.refresh_token,
        clientId: body.data.client_id,
        clientSecret: body.data.client_secret,
        codeVerifier: body.data.code_verifier,
        tokenType: body.data.token_type,
        expiresAt: body.data.expires_at,
        scopes: body.data.scopes,
        tokenUri: body.data.token_uri,
      }, callerService);

      return reply.code(200).send({ ok: true });
    },
  );

  // GET /v1/tokens/:customerId/:provider — Retrieve decrypted token
  app.get<{ Params: { customerId: string; provider: string } }>(
    "/v1/tokens/:customerId/:provider",
    async (request, reply) => {
      const params = tokenParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid path parameters" });
      }

      const { customerId, provider } = params.data;
      const callerService = getCallerService(request);

      const token = await retrieveToken(customerId, provider, callerService);

      if (!token) {
        return reply.code(404).send({ error: "Token not found" });
      }

      // Map camelCase TokenData to snake_case API response
      return reply.code(200).send({
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        client_id: token.clientId,
        client_secret: token.clientSecret,
        code_verifier: token.codeVerifier,
        token_type: token.tokenType,
        expires_at: token.expiresAt,
        scopes: token.scopes,
        token_uri: token.tokenUri,
      });
    },
  );

  // DELETE /v1/tokens/:customerId/:provider — Delete token
  app.delete<{ Params: { customerId: string; provider: string } }>(
    "/v1/tokens/:customerId/:provider",
    async (request, reply) => {
      const params = tokenParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid path parameters" });
      }

      const { customerId, provider } = params.data;
      const callerService = getCallerService(request);

      const deleted = await deleteToken(customerId, provider, callerService);

      if (!deleted) {
        return reply.code(404).send({ error: "Token not found" });
      }

      return reply.code(200).send({ ok: true });
    },
  );

  // GET /v1/tokens/:customerId/:provider/status — Check auth status
  app.get<{ Params: { customerId: string; provider: string } }>(
    "/v1/tokens/:customerId/:provider/status",
    async (request, reply) => {
      const params = tokenParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid path parameters" });
      }

      const { customerId, provider } = params.data;

      const status = await getTokenStatus(customerId, provider);

      if (!status) {
        return reply.code(404).send({ error: "Token not found" });
      }

      // Map camelCase TokenMetadata to snake_case API response
      return reply.code(200).send({
        provider: status.provider,
        token_type: status.tokenType,
        expires_at: status.expiresAt,
        scopes: status.scopes,
        is_expired: status.isExpired,
        created_at: status.createdAt,
        updated_at: status.updatedAt,
      });
    },
  );

  // GET /v1/tokens/:customerId — List all providers for customer
  app.get<{ Params: { customerId: string } }>(
    "/v1/tokens/:customerId",
    async (request, reply) => {
      const params = customerParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid path parameters" });
      }

      const tokens = await listCustomerTokens(params.data.customerId);

      // Map camelCase TokenMetadata[] to snake_case API response
      return reply.code(200).send({
        tokens: tokens.map((t) => ({
          provider: t.provider,
          token_type: t.tokenType,
          expires_at: t.expiresAt,
          scopes: t.scopes,
          is_expired: t.isExpired,
          created_at: t.createdAt,
          updated_at: t.updatedAt,
        })),
      });
    },
  );
}
