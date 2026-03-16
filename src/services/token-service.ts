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
    accessToken: encryptField(input.accessToken),
    refreshToken: encryptOptional(input.refreshToken),
    clientId: encryptOptional(input.clientId),
    clientSecret: encryptOptional(input.clientSecret),
    codeVerifier: encryptOptional(input.codeVerifier),
    tokenType: input.tokenType ?? "Bearer",
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    scopes: input.scopes ?? null,
    tokenUri: input.tokenUri ?? null,
  };

  await db.token.upsert({
    where: {
      customerId_provider: { customerId, provider },
    },
    create: {
      customerId,
      provider,
      ...data,
    },
    update: data,
  });

  await logAudit({
    customerId,
    provider,
    action: "token_stored",
    callerService,
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
      customerId_provider: { customerId, provider },
    },
  });

  if (!token) {
    return null;
  }

  await logAudit({
    customerId,
    provider,
    action: "token_retrieved",
    callerService,
  });

  return {
    accessToken: decryptField(token.accessToken),
    refreshToken: decryptOptional(token.refreshToken),
    clientId: decryptOptional(token.clientId),
    clientSecret: decryptOptional(token.clientSecret),
    codeVerifier: decryptOptional(token.codeVerifier),
    tokenType: token.tokenType,
    expiresAt: token.expiresAt,
    scopes: token.scopes,
    tokenUri: token.tokenUri,
  };
}

export async function deleteToken(
  customerId: string,
  provider: string,
  callerService: string,
): Promise<boolean> {
  const db = getDb();

  const result = await db.token.deleteMany({
    where: { customerId, provider },
  });

  if (result.count === 0) {
    return false;
  }

  await logAudit({
    customerId,
    provider,
    action: "token_deleted",
    callerService,
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
      customerId_provider: { customerId, provider },
    },
  });

  if (!token) {
    return null;
  }

  const now = new Date();
  const isExpired = token.expiresAt ? token.expiresAt < now : false;

  return {
    provider: token.provider,
    tokenType: token.tokenType,
    expiresAt: token.expiresAt,
    scopes: token.scopes,
    isExpired,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  };
}

export async function listCustomerTokens(
  customerId: string,
): Promise<TokenMetadata[]> {
  const db = getDb();

  const tokens = await db.token.findMany({
    where: { customerId },
    orderBy: { provider: "asc" },
  });

  const now = new Date();

  return tokens.map((token) => ({
    provider: token.provider,
    tokenType: token.tokenType,
    expiresAt: token.expiresAt,
    scopes: token.scopes,
    isExpired: token.expiresAt ? token.expiresAt < now : false,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  }));
}
