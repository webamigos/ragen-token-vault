import crypto from "node:crypto";
import { getDb } from "../db/client.js";
import { encrypt, decrypt } from "../crypto/encryption.js";
import { getConfig } from "../config.js";
import { storeToken } from "./token-service.js";
import { logAudit } from "./audit-service.js";

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
      customer_id: params.customerId,
      provider,
      redirect_uri: redirectUri,
      code_verifier: encrypt(codeVerifier, config.ENCRYPTION_KEY),
      scopes: params.scopes.join(" "),
      expires_at: new Date(Date.now() + STATE_EXPIRY_MS),
    },
  });

  await logAudit({
    customer_id: params.customerId,
    provider,
    action: "oauth_started",
    caller_service: "ragen-auth",
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

  if (pending.expires_at < new Date()) {
    await db.oAuthPendingState.delete({ where: { state } });
    throw new Error("OAuth state expired");
  }

  const codeVerifier = pending.code_verifier
    ? decrypt(pending.code_verifier, config.ENCRYPTION_KEY)
    : undefined;

  // Exchange code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: pending.redirect_uri ?? config.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Google token exchange failed: ${errorBody}`);
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
    pending.customer_id,
    pending.provider,
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type ?? "Bearer",
      expires_at: expiresAt,
      scopes: tokens.scope ?? pending.scopes ?? undefined,
      token_uri: GOOGLE_TOKEN_URL,
    },
    "ragen-auth",
  );

  // Clean up pending state
  await db.oAuthPendingState.delete({ where: { state } });

  await logAudit({
    customer_id: pending.customer_id,
    provider: pending.provider,
    action: "oauth_completed",
    caller_service: "ragen-auth",
  });

  return {
    customerId: pending.customer_id,
    provider: pending.provider,
    redirectUri: pending.redirect_uri ?? undefined,
  };
}

/**
 * Refresh a Google access token using the stored refresh token.
 */
export async function refreshAccessToken(
  customerId: string,
  provider: string,
  callerService: string,
): Promise<{ access_token: string; expires_at: Date | null }> {
  const config = getConfig();
  const db = getDb();

  const token = await db.token.findUnique({
    where: {
      customer_id_provider: { customer_id: customerId, provider },
    },
  });

  if (!token) {
    throw new Error("Token not found");
  }

  if (!token.refresh_token) {
    throw new Error("No refresh token available");
  }

  const refreshToken = decrypt(token.refresh_token, config.ENCRYPTION_KEY);

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Google token refresh failed: ${errorBody}`);
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
      customer_id_provider: { customer_id: customerId, provider },
    },
    data: {
      access_token: encrypt(tokens.access_token, config.ENCRYPTION_KEY),
      expires_at: expiresAt,
    },
  });

  await logAudit({
    customer_id: customerId,
    provider,
    action: "token_refreshed",
    caller_service: callerService,
  });

  return { access_token: tokens.access_token, expires_at: expiresAt };
}
