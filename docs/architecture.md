# Architecture

The service is small on purpose: four layers, three tables, one job. If a change
makes any layer know about another one's concerns, it is going the wrong way.

## Request flow

```
src/index.ts        env validation (zod) → OTEL → Fastify → signal handlers
  └─ src/server.ts  content-type parser (raw body) → public routes → authenticated scope
       └─ routes/   zod validation, snake_case ⇄ camelCase mapping, HTTP status codes
            └─ services/   business logic, encryption, audit writes, Google calls
                 └─ db/client.ts   Prisma singleton over @prisma/adapter-pg
```

Rules that keep it that shape:

- **Routes never encrypt, never call Prisma, never call Google.** They validate,
  map names, and choose a status code.
- **Services never import Fastify types.** They take plain arguments and return
  plain data, which is why every service test runs without a server.
- **`getDb()` and `getConfig()` are the only singletons.** Both are lazy; both
  are `vi.mock`ed in tests.

`src/instrument.ts` is imported on the first line of `src/index.ts`. OTEL
patches `http` and `pg` at import time, so anything imported above it loses its
instrumentation silently. It is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is
set.

## Route registration

```ts
await app.register(healthRoutes);              // public
await app.register(googleOAuthCallbackRoute);  // public — a browser arrives here
await app.register(async (authenticatedApp) => {
  authenticatedApp.addHook("preHandler", serviceAuthHook);
  await authenticatedApp.register(tokenRoutes);
  await authenticatedApp.register(googleOAuthRoutes);
});
```

Registration position **is** the authorization model. A route added at the top
level of `buildServer()` is reachable by anyone who can reach the service. Two
routes are public and each has a reason:

- `/health` — Railway's health check, returns `{status}` only, no data.
- `/v1/oauth/google/callback` — Google redirects a *browser* here, and a browser
  cannot hold the service secret. Its protection is the `state` row: single-use,
  10-minute TTL, bound to a PKCE verifier. See
  [`google-oauth.md`](google-oauth.md).

Anything else goes inside the authenticated scope. If you believe a third public
route is needed, that is an architecture decision — say so in the PR, do not
just register it.

The custom `application/json` parser that captures `request.rawBody` is part of
authentication, not a convenience. See [`service-auth.md`](service-auth.md).

## Modules

| Path | Responsibility |
|---|---|
| `src/auth/service-auth.ts` | HMAC verification hook, `computeSignature` (also the reference implementation for callers) |
| `src/crypto/encryption.ts` | AES-256-GCM encrypt/decrypt. Three functions, no state |
| `src/services/token-service.ts` | Token CRUD; encrypts on write, decrypts on read, audits both |
| `src/services/google-oauth-service.ts` | Auth URL + PKCE, callback exchange, refresh |
| `src/services/audit-service.ts` | One insert into `audit_logs`. Metadata only |
| `src/services/logger.ts`, `otel-logger.ts` | Pino, and the OTEL log bridge |
| `src/routes/*` | HTTP surface: zod schemas, wire-name mapping, status codes |
| `src/db/client.ts` | Prisma client singleton + `disconnectDb` for shutdown |
| `src/config.ts`, `src/validateEnvVars.ts` | zod env schema; `getConfig()` exits the process on invalid env |
| `src/types/index.ts` | Shared input/output types (`StoreTokenInput`, `TokenData`, `TokenMetadata`, `AuditAction`) |

## Database

Postgres via Prisma 7 with `@prisma/adapter-pg` — the raw `pg` driver, no Rust
query engine. The client is generated into `src/generated/prisma/`, which is
**gitignored**: a fresh checkout compiles nothing until `npm run generate:types`.
CLI configuration lives in `prisma.config.ts`; the datasource URL comes from the
environment, so `prisma/schema.prisma` carries no connection string.

| Table | Shape | Notes |
|---|---|---|
| `tokens` | unique `(customer_id, provider)`, index on `customer_id` | The composite unique is the scoping rule — see below |
| `oauth_pending_states` | primary key is the opaque `state` string | 10-minute TTL, deleted on use and swept on the next authorize |
| `audit_logs` | indexed on `customer_id` and `created_at` | Append-only in practice; nothing in the code updates or deletes a row |

**Every token read and write is keyed by `(customerId, provider)`.** The one
intentional exception is `listCustomerTokens`, which queries by customer and
returns metadata only — no ciphertext, no plaintext. A new query that takes only
a `customerId` and returns token material is a bug, not a shortcut.

Column names are snake_case in Postgres and camelCase in the client, via
`@map`. Adding a column means a migration (`npm run db:migrate:dev`) plus a
regenerated client; CI proves the migration applies by running
`prisma migrate deploy` against a real Postgres service container.

## Who calls this service

| Caller | How |
|---|---|
| `ragen-app` | `packages/vault-client`, HMAC-signed, `X-Service-Name: ragen-app` |
| `ragen-connectors` | its own signed client, for connector OAuth tokens |
| A customer's browser | only ever hits `/v1/oauth/google/callback`, as a redirect from Google |

Both callers hold the same shared secret. The vault trusts the signature, not
the `X-Service-Name` header — see the "Known limits" section of
[`service-auth.md`](service-auth.md).

Deployment, environment inventory and observability live in
[`operations.md`](operations.md).
