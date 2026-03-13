import { getDb } from "../db/client.js";
import { encrypt, decrypt } from "../crypto/encryption.js";
import { getConfig } from "../config.js";
import { logAudit } from "./audit-service.js";
import type { StoreTokenInput, TokenData, TokenMetadata } from "../types/index.js";

function encryptField(value: string): string {
  return encrypt(value, getConfig().ENCRYPTION_KEY);
}

function decryptField(value: string): string {
  return decrypt(value, getConfig().ENCRYPTION_KEY);
}

function encryptOptional(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  return encryptField(value);
}

function decryptOptional(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  return decryptField(value);
}

export async function storeToken(
  customerId: string,
  provider: string,
  input: StoreTokenInput,
  callerService: string,
): Promise<void> {
  const db = getDb();

  const data = {
    access_token: encryptField(input.access_token),
    refresh_token: encryptOptional(input.refresh_token),
    client_id: encryptOptional(input.client_id),
    client_secret: encryptOptional(input.client_secret),
    code_verifier: encryptOptional(input.code_verifier),
    token_type: input.token_type ?? "Bearer",
    expires_at: input.expires_at ? new Date(input.expires_at) : null,
    scopes: input.scopes ?? null,
    token_uri: input.token_uri ?? null,
  };

  await db.token.upsert({
    where: {
      customer_id_provider: { customer_id: customerId, provider },
    },
    create: {
      customer_id: customerId,
      provider,
      ...data,
    },
    update: data,
  });

  await logAudit({
    customer_id: customerId,
    provider,
    action: "token_stored",
    caller_service: callerService,
  });
}

export async function retrieveToken(
  customerId: string,
  provider: string,
  callerService: string,
): Promise<TokenData | null> {
  const db = getDb();

  const token = await db.token.findUnique({
    where: {
      customer_id_provider: { customer_id: customerId, provider },
    },
  });

  if (!token) {
    return null;
  }

  await logAudit({
    customer_id: customerId,
    provider,
    action: "token_retrieved",
    caller_service: callerService,
  });

  return {
    access_token: decryptField(token.access_token),
    refresh_token: decryptOptional(token.refresh_token),
    client_id: decryptOptional(token.client_id),
    client_secret: decryptOptional(token.client_secret),
    code_verifier: decryptOptional(token.code_verifier),
    token_type: token.token_type,
    expires_at: token.expires_at,
    scopes: token.scopes,
    token_uri: token.token_uri,
  };
}

export async function deleteToken(
  customerId: string,
  provider: string,
  callerService: string,
): Promise<boolean> {
  const db = getDb();

  const existing = await db.token.findUnique({
    where: {
      customer_id_provider: { customer_id: customerId, provider },
    },
  });

  if (!existing) {
    return false;
  }

  await db.token.delete({
    where: {
      customer_id_provider: { customer_id: customerId, provider },
    },
  });

  await logAudit({
    customer_id: customerId,
    provider,
    action: "token_deleted",
    caller_service: callerService,
  });

  return true;
}

export async function getTokenStatus(
  customerId: string,
  provider: string,
): Promise<TokenMetadata | null> {
  const db = getDb();

  const token = await db.token.findUnique({
    where: {
      customer_id_provider: { customer_id: customerId, provider },
    },
  });

  if (!token) {
    return null;
  }

  const now = new Date();
  const isExpired = token.expires_at ? token.expires_at < now : false;

  return {
    provider: token.provider,
    token_type: token.token_type,
    expires_at: token.expires_at,
    scopes: token.scopes,
    is_expired: isExpired,
    created_at: token.created_at,
    updated_at: token.updated_at,
  };
}

export async function listCustomerTokens(
  customerId: string,
): Promise<TokenMetadata[]> {
  const db = getDb();

  const tokens = await db.token.findMany({
    where: { customer_id: customerId },
    orderBy: { provider: "asc" },
  });

  const now = new Date();

  return tokens.map((token) => ({
    provider: token.provider,
    token_type: token.token_type,
    expires_at: token.expires_at,
    scopes: token.scopes,
    is_expired: token.expires_at ? token.expires_at < now : false,
    created_at: token.created_at,
    updated_at: token.updated_at,
  }));
}
