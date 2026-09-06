# Google OAuth flow

Implemented in
[`src/services/google-oauth-service.ts`](../src/services/google-oauth-service.ts)
and exposed by [`src/routes/oauth-google.ts`](../src/routes/oauth-google.ts).
Authorization Code flow with PKCE, `access_type=offline` and `prompt=consent`
so Google actually returns a refresh token.

## The three legs

**1. `GET /v1/oauth/google/authorize`** (HMAC-authenticated)

Query: `customer_id`, `scopes` (comma-separated), optional `redirect_uri`,
optional `provider` (defaults to `GOOGLE`).

- Sweeps expired rows out of `oauth_pending_states`.
- Generates `state` (32 random bytes, hex) and a PKCE `code_verifier`
  (32 random bytes, base64url); the challenge is `S256`.
- Writes the pending row — the verifier is **encrypted** with the same
  `ENCRYPTION_KEY` as tokens, TTL 10 minutes.
- Audits `oauth_started`, then **302s to Google**. The caller gets a redirect,
  not a JSON URL; a client that follows redirects automatically will chase it
  into Google's consent screen.

**2. `GET /v1/oauth/google/callback`** (public)

Google redirects the customer's browser here with `code` and `state`.

- Looks up the pending row by `state`. Missing → `Invalid or expired OAuth
  state`. Expired → the row is deleted and the request fails.
- Decrypts the verifier, exchanges the code at
  `https://oauth2.googleapis.com/token` (15 s timeout).
- Stores the tokens through `storeToken`, so they are encrypted on the way in,
  then deletes the pending row and audits `oauth_completed`.
- If the pending row carried a `redirect_uri`, redirects the browser there with
  `?provider=…&status=success`; otherwise returns JSON.

**3. `POST /v1/oauth/google/refresh`** (HMAC-authenticated)

Body: `customer_id`, optional `provider`. Decrypts the stored refresh token,
calls Google, writes back the new access token and `expires_at`, audits
`token_refreshed`. Returns `access_token` and `expires_at` in snake_case.

## Why the callback is public, and what protects it

A browser cannot hold the service secret, so this one route cannot be
HMAC-signed. Its defences are the pending-state row itself:

- `state` is 256 bits of CSPRNG output and is the table's primary key.
- It is **single-use** — deleted after a successful exchange.
- It expires in **10 minutes**, checked on read and swept on the next authorize.
- The PKCE verifier is bound to that row, so a stolen `code` alone cannot be
  exchanged.

Anything that weakens one of those — a longer TTL, a reusable state, dropping
PKCE for a provider that "does not need it" — turns a public endpoint into an
open token-minting hole. Do not do it without an ADR.

The callback returns Google's failure as a 400 with a short message. It must
never return the token response, and `logger.error` on that path logs Google's
*error* body only — never a successful exchange.

## Adding another provider

`provider` is already a free string column and the authorize route accepts a
`provider` parameter, but the service is Google-specific below that: the URLs,
the token-exchange body and the refresh call are hardcoded. Adding a second
provider is a real change, not a config value — see
[`.claude/skills/vault-add-provider/SKILL.md`](../.claude/skills/vault-add-provider/SKILL.md)
for what has to move and what must not.

## Local testing

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` default to empty strings, so the
service boots without them and only the OAuth routes fail. `GOOGLE_REDIRECT_URI`
defaults to `http://localhost:3100/v1/oauth/google/callback` and must match the
redirect URI registered in the Google Cloud console exactly, including the port.

The service tests mock `fetch` and the database — nothing in `npm run test:run`
talks to Google. A genuine end-to-end check needs real credentials and a browser,
and belongs in a manual pass, not in CI.
