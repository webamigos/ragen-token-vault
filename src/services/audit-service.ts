import type { Prisma } from "../generated/prisma/client.js";
import { getDb } from "../db/client.js";
import type { AuditAction } from "../types/index.js";

export async function logAudit(params: {
  customer_id: string;
  provider: string;
  action: AuditAction;
  caller_service: string;
  metadata?: Prisma.InputJsonObject;
}): Promise<void> {
  const db = getDb();
  await db.auditLog.create({
    data: {
      customer_id: params.customer_id,
      provider: params.provider,
      action: params.action,
      caller_service: params.caller_service,
      metadata: params.metadata ?? undefined,
    },
  });
}
