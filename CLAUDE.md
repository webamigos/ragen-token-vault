# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Centralized Token Vault Service for the ragen ecosystem. Stores customer OAuth tokens and API keys with AES-256-GCM encryption. Other services (ragen-app, ragen-mcp) call this service and remain stateless regarding secrets.

## Commands

```bash
npm run dev              # Start dev server with hot reload (tsx watch, port 3100)
npm run build            # prisma generate + tsc
npm run test             # vitest in watch mode
npm run test:run         # vitest single run
npx vitest run src/crypto/encryption.test.ts  # run a single test file
npm run lint             # eslint src/
npm run db:migrate:dev   # create/apply dev migrations
npm run db:migrate       # deploy migrations (production)
npm run generate:types   # regenerate Prisma client to src/generated/prisma/
```

Local Postgres: `docker compose up -d`, then `cp .env.example .env` and `npx prisma migrate dev`.

## Architecture

**ESM-only** (`"type": "module"`) — all local imports use `.js` extensions.

### Request Flow

1. `src/index.ts` — entrypoint, imports `instrument.ts` first (OTEL setup), then boots Fastify
2. `src/server.ts` — registers routes in two groups:
   - **Public**: health check (`/health`), Google OAuth callback
   - **Authenticated**: all other routes guarded by `serviceAuthHook` (HMAC-SHA256 preHandler)
3. Routes (`src/routes/`) delegate to services (`src/services/`)

### Key Layers

- **Auth** (`src/auth/service-auth.ts`): HMAC-SHA256 service-to-service auth. Signature format: `HMAC(secret, "{ts}\n{method}\n{path}\n{body_sha256}")`. Caller identified via `X-Service-Name` header.
- **Crypto** (`src/crypto/encryption.ts`): AES-256-GCM encrypt/decrypt. Storage format: `{iv_hex}:{ciphertext_b64}:{auth_tag_hex}`.
- **Token Service** (`src/services/token-service.ts`): CRUD for encrypted tokens. Encrypts sensitive fields before DB write, decrypts on read.
- **Google OAuth Service** (`src/services/google-oauth-service.ts`): Google OAuth flow — generates auth URLs, handles callbacks, refreshes access tokens.
- **Audit Service** (`src/services/audit-service.ts`): Writes audit log entries for token operations.
- **DB** (`src/db/client.ts`): Prisma 7 with `@prisma/adapter-pg` (raw pg driver). Generated client lives in `src/generated/prisma/` (gitignored).
- **Config** (`src/config.ts`): Zod-validated env vars, singleton pattern.
- **Env Validation** (`src/validateEnvVars.ts`): Zod schema for required environment variables.

### Database

Prisma schema at `prisma/schema.prisma`. Three tables: `tokens`, `oauth_pending_states`, `audit_logs`. Composite unique on `(customer_id, provider)` for tokens.

Prisma config file at `prisma.config.ts` (used by Prisma CLI).

### Observability

`src/instrument.ts` must be imported before everything else. Sets up OTEL traces, metrics, and logs. Pino logger at `src/services/logger.ts`, OTEL log bridge at `src/services/otel-logger.ts`.

## Code Conventions

- TypeScript strict mode, ES2022 target, Node16 module resolution
- ESLint with `curly: "error"` — always use braces for control flow
- Vitest with `globals: true` (no need to import `describe`/`it`/`expect`)
- Shared types in `src/types/index.ts`
- Config accessed via `getConfig()` singleton, DB via `getDb()` singleton
