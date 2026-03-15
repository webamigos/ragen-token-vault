import crypto from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getConfig } from "../config.js";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Compute HMAC-SHA256 signature for service-to-service auth.
 * Message format: "{timestamp}\n{method}\n{path}\n{body_sha256}"
 */
export function computeSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  const bodySha256 = crypto.createHash("sha256").update(body).digest("hex");
  const message = `${timestamp}\n${method}\n${path}\n${bodySha256}`;
  return crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
}

/**
 * Verify HMAC-SHA256 signature using timing-safe comparison.
 */
function verifySignature(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(actual, "hex"),
  );
}

/**
 * Parse the Authorization header.
 * Format: "HMAC-SHA256 ts={unix},sig={hex}"
 */
function parseAuthHeader(header: string): { ts: string; sig: string } | null {
  const match = header.match(/^HMAC-SHA256 ts=(\d+),sig=([0-9a-f]+)$/i);
  if (!match) {
    return null;
  }
  return { ts: match[1]!, sig: match[2]! };
}

/**
 * Fastify preHandler hook for service-to-service HMAC authentication.
 */
export async function serviceAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    reply.code(401).send({ error: "Missing Authorization header" });
    return;
  }

  const parsed = parseAuthHeader(authHeader);
  if (!parsed) {
    reply.code(401).send({ error: "Invalid Authorization header format" });
    return;
  }

  // Validate timestamp is within acceptable window
  const requestTime = parseInt(parsed.ts, 10) * 1000;
  const now = Date.now();
  if (Math.abs(now - requestTime) > MAX_TIMESTAMP_DRIFT_MS) {
    reply.code(401).send({ error: "Request timestamp out of range" });
    return;
  }

  const config = getConfig();
  const rawBody =
    request.method === "GET" || request.method === "DELETE"
      ? ""
      : (request.rawBody ?? "");

  const expectedSig = computeSignature(
    config.RAGEN_TOKEN_VAULT_SERVICE_SECRET,
    parsed.ts,
    request.method,
    request.url.split("?")[0]!,
    rawBody,
  );

  if (!verifySignature(expectedSig, parsed.sig)) {
    reply.code(401).send({ error: "Invalid signature" });
    return;
  }

  // Attach service name for audit logging
  const serviceName =
    (request.headers["x-service-name"] as string) || "unknown";
  (request as FastifyRequest & { serviceName: string }).serviceName =
    serviceName;
}
