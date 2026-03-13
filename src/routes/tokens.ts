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

      await storeToken(customerId, provider, body.data, callerService);

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

      return reply.code(200).send(token);
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

      return reply.code(200).send(status);
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

      return reply.code(200).send({ tokens });
    },
  );
}
