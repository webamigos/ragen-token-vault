import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    try {
      const db = getDb();
      await db.$queryRaw`SELECT 1`;
      return reply.code(200).send({ status: "ok" });
    } catch {
      return reply.code(503).send({ status: "unhealthy" });
    }
  });
}
