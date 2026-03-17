import type { Prisma } from "../generated/prisma/client.js";
import { getDb } from "../db/client.js";
import type { AuditAction } from "../types/index.js";

export async function logAudit(params: {
  customerId: string;
  provider: string;
  action: AuditAction;
  callerService: string;
  metadata?: Prisma.InputJsonObject;
}): Promise<void> {
  const db = getDb();
  await db.auditLog.create({
    data: {
      customerId: params.customerId,
      provider: params.provider,
      action: params.action,
      callerService: params.callerService,
      metadata: params.metadata ?? undefined,
    },
  });
}
