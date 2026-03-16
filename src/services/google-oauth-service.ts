import crypto from "node:crypto";
import { getDb } from "../db/client.js";
import { encrypt, decrypt } from "../crypto/encryption.js";
import { getConfig } from "../config.js";
import { storeToken } from "./token-service.js";
import { logAudit } from "./audit-service.js";
import { logger } from "./logger.js";

const FETCH_TIMEOUT_MS = 15_000;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface AuthorizeParams {
  customerId: string;
  scopes: string[];
  redirectUri?: string;
  provider?: string;
}

/**
 * Generate Google OAuth authorization URL with PKCE.
 */
export async function generateAuthUrl(
  params: AuthorizeParams,
): Promise<string> {
  const config = getConfig();
  const db = getDb();

  // Clean up expired pending states
  await db.oAuthPendingState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const provider = params.provider ?? "GOOGLE";
  const redirectUri = params.redirectUri ?? config.GOOGLE_REDIRECT_URI;

  // Store pending state
  await db.oAuthPendingState.create({
    data: {
      state,
      customerId: params.customerId,
      provider,
      redirectUri,
      codeVerifier: encrypt(codeVerifier, config.ENCRYPTION_KEY),
      scopes: params.scopes.join(" "),
      expiresAt: new Date(Date.now() + STATE_EXPIRY_MS),
    },
  });

  await logAudit({
    customerId: params.customerId,
    provider,
    action: "oauth_started",
    callerService: "ragen-token-vault",
    metadata: { scopes: params.scopes },
  });

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return url.toString();
}

/**
 * Handle Google OAuth callback — exchange code for tokens and store them.
 */
export async function handleCallback(
  code: string,
  state: string,
): Promise<{ customerId: string; provider: string; redirectUri?: string }> {
  const config = getConfig();
  const db = getDb();

  // Look up pending state
  const pending = await db.oAuthPendingState.findUnique({
    where: { state },
  });

  if (!pending) {
    throw new Error("Invalid or expired OAuth state");
  }

  if (pending.expiresAt < new Date()) {
    await db.oAuthPendingState.delete({ where: { state } });
    throw new Error("OAuth state expired");
  }

  const pendingCodeVerifier = pending.codeVerifier
    ? decrypt(pending.codeVerifier, config.ENCRYPTION_KEY)
    : undefined;

  // Exchange code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: pending.redirectUri ?? config.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      ...(pendingCodeVerifier ? { code_verifier: pendingCodeVerifier } : {}),
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    logger.error({ status: tokenResponse.status, errorBody }, "Google token exchange failed");
    throw new Error(`Google token exchange failed (status ${tokenResponse.status})`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  // Store encrypted tokens
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : undefined;

  await storeToken(
    pending.customerId,
    pending.provider,
    {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type ?? "Bearer",
      expiresAt,
      scopes: tokens.scope ?? pending.scopes ?? undefined,
      tokenUri: GOOGLE_TOKEN_URL,
    },
    "ragen-token-vault",
  );

  // Clean up pending state
  await db.oAuthPendingState.delete({ where: { state } });

  await logAudit({
    customerId: pending.customerId,
    provider: pending.provider,
    action: "oauth_completed",
    callerService: "ragen-token-vault",
  });

  return {
    customerId: pending.customerId,
    provider: pending.provider,
    redirectUri: pending.redirectUri ?? undefined,
  };
}

/**
 * Refresh a Google access token using the stored refresh token.
 */
export async function refreshAccessToken(
  customerId: string,
  provider: string,
  callerService: string,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const config = getConfig();
  const db = getDb();

  const token = await db.token.findUnique({
    where: {
      customerId_provider: { customerId, provider },
    },
  });

  if (!token) {
    throw new Error("Token not found");
  }

  if (!token.refreshToken) {
    throw new Error("No refresh token available");
  }

  const refreshToken = decrypt(token.refreshToken, config.ENCRYPTION_KEY);

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    logger.error({ status: tokenResponse.status, errorBody }, "Google token refresh failed");
    throw new Error(`Google token refresh failed (status ${tokenResponse.status})`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  // Update stored token
  await db.token.update({
    where: {
      customerId_provider: { customerId, provider },
    },
    data: {
      accessToken: encrypt(tokens.access_token, config.ENCRYPTION_KEY),
      expiresAt,
    },
  });

  await logAudit({
    customerId,
    provider,
    action: "token_refreshed",
    callerService,
  });

  return { accessToken: tokens.access_token, expiresAt };
}
