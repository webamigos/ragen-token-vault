import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  storeToken,
  retrieveToken,
  deleteToken,
  getTokenStatus,
  listCustomerTokens,
} from "../services/token-service.js";
import type { StoreTokenInput } from "../types/index.js";

interface TokenParams {
  customerId: string;
  provider: string;
}

interface CustomerParams {
  customerId: string;
}

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  // PUT /v1/tokens/:customerId/:provider — Store/update token
  app.put<{ Params: TokenParams; Body: StoreTokenInput }>(
    "/v1/tokens/:customerId/:provider",
    async (request, reply) => {
      const { customerId, provider } = request.params;
      const callerService =
        (request as FastifyRequest & { serviceName?: string }).serviceName ??
        "unknown";

      await storeToken(customerId, provider, request.body, callerService);

      return reply.code(200).send({ ok: true });
    },
  );

  // GET /v1/tokens/:customerId/:provider — Retrieve decrypted token
  app.get<{ Params: TokenParams }>(
    "/v1/tokens/:customerId/:provider",
    async (request, reply) => {
      const { customerId, provider } = request.params;
      const callerService =
        (request as FastifyRequest & { serviceName?: string }).serviceName ??
        "unknown";

      const token = await retrieveToken(customerId, provider, callerService);

      if (!token) {
        return reply.code(404).send({ error: "Token not found" });
      }

      return reply.code(200).send(token);
    },
  );

  // DELETE /v1/tokens/:customerId/:provider — Delete token
  app.delete<{ Params: TokenParams }>(
    "/v1/tokens/:customerId/:provider",
    async (request, reply) => {
      const { customerId, provider } = request.params;
      const callerService =
        (request as FastifyRequest & { serviceName?: string }).serviceName ??
        "unknown";

      const deleted = await deleteToken(customerId, provider, callerService);

      if (!deleted) {
        return reply.code(404).send({ error: "Token not found" });
      }

      return reply.code(200).send({ ok: true });
    },
  );

  // GET /v1/tokens/:customerId/:provider/status — Check auth status
  app.get<{ Params: TokenParams }>(
    "/v1/tokens/:customerId/:provider/status",
    async (request, reply) => {
      const { customerId, provider } = request.params;

      const status = await getTokenStatus(customerId, provider);

      if (!status) {
        return reply.code(404).send({ error: "Token not found" });
      }

      return reply.code(200).send(status);
    },
  );

  // GET /v1/tokens/:customerId — List all providers for customer
  app.get<{ Params: CustomerParams }>(
    "/v1/tokens/:customerId",
    async (request, reply) => {
      const { customerId } = request.params;

      const tokens = await listCustomerTokens(customerId);

      return reply.code(200).send({ tokens });
    },
  );
}
