---
name: vault-add-provider
description: Add a second OAuth provider (Microsoft, Slack, HubSpot, …) alongside Google in the token vault — what generalizes, what must not, and the security properties any new provider flow has to keep. Use when asked to support a new OAuth provider or to make the OAuth service provider-agnostic. Triggers on "nowy provider", "add provider", "Microsoft OAuth", "provider-agnostic".
---

# Adding an OAuth provider

## What already generalizes

`provider` is a plain string column, part of the `(customer_id, provider)`
unique, and `oauth_pending_states` carries it too. `storeToken`,
`retrieveToken`, `deleteToken`, `getTokenStatus`, `listCustomerTokens` and the
whole `/v1/tokens/*` surface are provider-agnostic already — a token stored
under `MICROSOFT` works today, if something puts it there.

The audit actions (`token_stored`, `token_retrieved`, `oauth_started`,
`oauth_completed`, `token_refreshed`) are equally generic. Check
`src/types/index.ts` before inventing a new one.

## What is Google-specific

Everything in
[`src/services/google-oauth-service.ts`](../../../src/services/google-oauth-service.ts):
the two hardcoded URLs, the token-exchange body, the refresh body, the
`access_type=offline` / `prompt=consent` parameters that make Google return a
refresh token, and the config keys `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_REDIRECT_URI`. The routes are Google-specific too — the paths are
`/v1/oauth/google/*`.

Note that `generateAuthUrl` already takes a `provider` parameter defaulting to
`GOOGLE`. That only names the row; it does not change which provider is
contacted. Do not mistake it for existing multi-provider support.

## The shape to aim for

Prefer a provider registry over a second copy of the service:

1. A `providers/<name>.ts` module per provider exporting the pieces that differ:
   authorize URL, token URL, the extra authorize params, how to read
   `expires_in`/`refresh_token` out of the response, and the config keys.
2. One generic `oauth-service.ts` that keeps the flow — state generation, PKCE,
   the pending row, the exchange, `storeToken`, the audit calls, the cleanup.
3. Routes at `/v1/oauth/:provider/authorize|callback|refresh`, with the provider
   validated against the registry (a zod enum, not a free string) so an unknown
   provider is a 400 and never a lookup that reaches the network.

Keep the existing `/v1/oauth/google/*` paths working — `ragen-app` and
`ragen-connectors` call them. Add the generic paths, migrate callers, then
consider removing the aliases in a later release.

## Properties the new flow must keep

These are not stylistic — each one is load-bearing:

- **PKCE.** S256, verifier stored **encrypted** in the pending row. If a
  provider does not support PKCE, that is a decision to document, not a default
  to drop.
- **State**: 32 random bytes, single-use, deleted after exchange, 10-minute TTL
  checked on read.
- **`/v1/oauth/:provider/callback` is the only public route of the three.** A
  browser arrives there from the provider and cannot hold the service secret, so
  it is registered *outside* the `serviceAuthHook` scope in `buildServer()`.
  `authorize` and `refresh` stay inside it, service-authenticated. Adding any
  further public route is out of scope for a provider change — the only two that
  exist are `/health` and this callback.
- **Tokens are stored through `storeToken`**, never written to Prisma directly,
  so they are encrypted and audited on the way in.
- **Provider secrets go through the zod env schema** and into `.env.example`,
  and default to `""` so the service still boots without them — the way the
  Google keys do.
- Nothing from a successful token response is ever logged.

## Tests

Mirror `google-oauth-service.test.ts`: mock `fetch` and the database, and cover
the exchange, a refresh, an expired state, and an unknown state. Add a route
test that an unrecognized `:provider` is rejected by validation before any
service call. Then update `docs/google-oauth.md` (or split it per provider) and
the README endpoint table.
