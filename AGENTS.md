# AGENTS.md

Guidance for coding agents working in this repository. This is the canonical
file — Claude Code, Codex, Cursor and Copilot all read `AGENTS.md`, and
`CLAUDE.md` is a one-line import of it so both names resolve to the same
content. Edit this file, never the pointer.

> **Instruction budget:** keep this file under **32,768 bytes** — Codex's
> default `project_doc_max_bytes`. Content past that offset never reaches the
> agent, silently. Check with `wc -c AGENTS.md`. When it gets close, move
> long-form detail into `docs/` and leave a pointer here rather than trimming
> the hard rules.

## What this is

`@ragenai/ragen-token-vault` — the centralized token vault for the Ragen
ecosystem. It stores every customer's OAuth tokens and API keys encrypted with
AES-256-GCM, so `ragen-app` and `ragen-connectors` can stay stateless about
secrets. It is the most security-sensitive repository in the ecosystem: a
mistake here does not degrade a feature, it exposes every customer's third-party
credentials at once.

Fastify 5 + Prisma 7 (raw `pg` adapter) + Postgres, ESM-only, deployed on
Railway. Two consumers call it over HMAC-signed HTTP: `ragen-app`
(`packages/vault-client`) and `ragen-connectors`.

## Commands

```bash
docker compose up -d      # local Postgres (published on 5435, see Local Development)
npm run dev               # tsx watch, port 3100, reads .env.local
npm run verify            # THE gate: generate types → lint → test → build
npm run typecheck         # tsc --noEmit, fast inner loop
npm run lint              # eslint src/
npm run test              # vitest watch
npm run test:run          # vitest single run
npm run test:coverage     # + v8 coverage (json-summary is required by CI)
npm run build             # prisma generate + tsc → dist/
npm run generate:types    # Prisma client → src/generated/prisma/ (gitignored)
npm run db:migrate:dev    # create/apply a dev migration
npm run db:migrate        # prisma migrate deploy (what Railway runs pre-deploy)
npx vitest run src/crypto/encryption.test.ts   # one file
```

`npm run verify` takes about 12 seconds cold. Run it before declaring work
done — there is no separate typecheck step in CI, `build` is what catches type
errors.

## Task Router

Before a nontrivial task, read the linked doc first, and skim
[`docs/lessons.md`](docs/lessons.md) for the area you are touching so you do not
re-discover a known gotcha. Skip this for one-line fixes.

| Task | Where to look |
|---|---|
| Changing anything about request signing, or debugging a caller's 401 | [`docs/service-auth.md`](docs/service-auth.md), [`.claude/skills/vault-client-integration/SKILL.md`](.claude/skills/vault-client-integration/SKILL.md) |
| Changing encryption, the ciphertext envelope, or the key | [`docs/encryption.md`](docs/encryption.md) |
| Rotating `ENCRYPTION_KEY` or the service secret | [`docs/encryption.md`](docs/encryption.md#key-rotation) — read before promising anyone it is easy |
| Google OAuth flow, PKCE, pending states, refresh | [`docs/google-oauth.md`](docs/google-oauth.md) |
| Adding a second OAuth provider | [`.claude/skills/vault-add-provider/SKILL.md`](.claude/skills/vault-add-provider/SKILL.md) |
| Where a module lives, what calls what | [`docs/architecture.md`](docs/architecture.md) |
| Adding a route, and whether it is public or authenticated | [`docs/architecture.md`](docs/architecture.md#route-registration), "Route registration" below |
| Schema change, migration, Prisma 7 specifics | [`docs/architecture.md`](docs/architecture.md#database), "Prisma" below |
| Deploying, Railway, health checks, OTEL, releases | [`docs/operations.md`](docs/operations.md) |
| Reviewing a change against this repo's invariants | [`.claude/skills/vault-code-review/SKILL.md`](.claude/skills/vault-code-review/SKILL.md) |
| A local setup that "works" but talks to the wrong database | [`docs/lessons.md`](docs/lessons.md) → local-dev |

## Cross-service contracts

Three things in this repository are contracts other repositories depend on.
Changing any of them unilaterally breaks production for every caller, and
nothing in this repo's CI will tell you.

**1. The HMAC message format.** `HMAC-SHA256(secret, "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}")`,
sent as `Authorization: HMAC-SHA256 ts=<unix_seconds>,sig=<hex>`. The path is
signed **without the query string**; `GET` and `DELETE` sign an empty body; the
body hash is over the **raw request bytes**, not a re-serialized object. A
±5 minute clock drift is allowed. Implemented in
[`src/auth/service-auth.ts`](src/auth/service-auth.ts), specified in
[`docs/service-auth.md`](docs/service-auth.md). Changing it means a coordinated
release with `ragen-app`'s `packages/vault-client` and `ragen-connectors` —
describe that rollout in the PR body or do not merge.

**2. The ciphertext envelope.** `{iv_hex}:{ciphertext_b64}:{auth_tag_hex}`,
AES-256-GCM, 12-byte IV, 16-byte tag. Every stored row is in this format and
there is **no migration tooling and no key rotation script**. A change that does
not read the old format orphans every token in production — irreversibly, since
the plaintext exists nowhere else.

**3. The HTTP surface.** Request and response bodies are `snake_case` on the
wire (`access_token`, `customer_id`) and camelCase inside the service. Routes
are versioned under `/v1/`. Adding a field is safe; renaming or removing one is
a breaking change for the two callers.

## Hard rules

- **`instrument.ts` is imported first in `src/index.ts`.** OTEL patches modules
  at import time; anything imported above it is never instrumented and you lose
  its traces silently. Do not reorder, do not add an import above it.
- **A decrypted value never reaches a log, a span attribute, an error body, a
  test fixture or an audit row.** Audit logs are metadata only: customer,
  provider, action, caller. `logger.error` calls in the OAuth service log
  Google's *error* body — never log a successful token response.
- **Token lookups are scoped by `(customerId, provider)`**, the composite
  unique. The single exception is `listCustomerTokens`, which is by customer on
  purpose and returns metadata only — never ciphertext, never plaintext.
- **Secrets are compared with `crypto.timingSafeEqual`**, never `===`. See
  `verifySignature`.
- **Every new env var goes in `src/validateEnvVars.ts` (zod) and in
  `.env.example`.** `getConfig()` exits the process on an invalid env, so a
  missing var fails at boot rather than at the first request — keep it that way.

### Route registration

`buildServer()` registers two groups, and the difference is the entire
authentication model:

```ts
await app.register(healthRoutes);            // public
await app.register(googleOAuthCallbackRoute); // public — browser redirect from Google
await app.register(async (authenticatedApp) => {
  authenticatedApp.addHook("preHandler", serviceAuthHook);
  await authenticatedApp.register(tokenRoutes);
  await authenticatedApp.register(googleOAuthRoutes);
});
```

A route registered at the top level of `buildServer` is **unauthenticated**.
Anything new belongs inside the inner plugin scope unless you can say why a
browser must reach it. The callback route is public because Google redirects a
browser to it; its protection is the one-time, 10-minute, PKCE-bound `state`
row, not a signature.

**The raw-body content-type parser is part of authentication.** The custom
`application/json` parser stashes the raw string on `request.rawBody`, which is
what the HMAC is verified against. If you add a parser for another content type
without capturing `rawBody`, every signed request with that content type fails
with a 401 that says nothing useful.

## Local development

Node.js 24.x (`.nvmrc`). `docker compose up -d` publishes Postgres on **5435**
(override with `POSTGRES_PORT`) — not 5432, and not the 5433 that older docs
mentioned. Every Ragen repo picks a different published port on purpose:
`ragen-app` uses 55432, and a native Postgres on 5432 will happily answer
`prisma migrate` while you believe you are talking to the container.

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run generate:types      # required — the client is gitignored, nothing compiles without it
npx prisma migrate dev
npm run dev                 # port 3100
```

`ENCRYPTION_KEY` must be exactly 64 hex chars (32 bytes) and
`RAGEN_TOKEN_VAULT_SERVICE_SECRET` at least 32 chars; both are validated at
boot. Generate with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

`HOST` defaults to `::` (dual-stack). That is deliberate and load-bearing on
Railway — see [`docs/lessons.md`](docs/lessons.md) → deployment before you
"fix" it to `0.0.0.0`.

## Architecture

Request flow: `src/index.ts` (env validation, OTEL, signals) → `src/server.ts`
(Fastify, parsers, route groups) → `src/routes/*` (zod validation, snake_case
↔ camelCase mapping) → `src/services/*` (business logic, encryption, audit) →
`src/db/client.ts` (Prisma singleton).

Routes never encrypt, never call Prisma, and never talk to Google. Services
never read Fastify types. Keep it that way — it is why the crypto surface is
three functions wide and testable without a database.

Full layout, and the three tables, in
[`docs/architecture.md`](docs/architecture.md).

### Prisma

Prisma 7 with `@prisma/adapter-pg` (raw `pg` driver, no Rust engine). The client
is generated into `src/generated/prisma/` which is **gitignored** — a fresh
checkout has no client and nothing compiles until `npm run generate:types`. CLI
config lives in `prisma.config.ts`; the datasource URL comes from the
environment, not the schema.

`tsc` compiles the generated `.ts` into `dist/generated/`, but non-TypeScript
assets next to it are not compiled — that is why the Dockerfile also copies
`src/generated` into `dist/generated` and re-runs `prisma generate` in the
runner stage. Four consecutive fix commits went into getting that right; if you
change the build or the Dockerfile, read
[`docs/lessons.md`](docs/lessons.md) → deployment first.

### Why there is no Turborepo here

`ragen-app` uses Turborepo because it has eleven workspaces with a real
dependency graph. This repository is a single package whose entire gate —
generate, lint, 62 tests, build — runs in about twelve seconds. Turbo would add
a dependency, a config file, a cache directory and a class of "why is this
stale" failures in exchange for saving a few seconds on a repeat build with
nothing changed. `npm run verify` is the gate; if the gate ever grows past a
minute, revisit this paragraph rather than reaching for turbo reflexively.

## Testing

Vitest with `globals: true` — no importing `describe`/`it`/`expect`. Tests live
beside the code as `*.test.ts`.

**Every test in this repo is a unit test with a mocked database.** `getDb` is
`vi.mock`ed and the Prisma calls are asserted, so `npm run test:run` needs no
Postgres. The consequence is that no test proves a query actually runs — the
schema is exercised in CI only by `prisma migrate deploy` against a real
Postgres service container. When you change a query shape, the mock will happily
agree with you; check the generated types, not just the test.

What a change here must come with:

- crypto: a round-trip test **and** a tamper test (a flipped byte in the
  ciphertext or tag must throw, not return garbage).
- auth: a test for the rejection path, not just the happy path — bad signature,
  missing header, stale timestamp.
- routes: a test that the validation rejects the malformed input, since zod
  parsing is the only thing between the wire and the service layer.

## Commits, releases, deployment

Conventional Commits are not decoration here: `semantic-release` runs on every
push to `main` and derives the version and the GitHub release from the commit
subjects. `feat:` is a minor, `fix:` a patch, `chore:`/`docs:`/`refactor:` no
release. A squash-merge subject is what ends up being parsed.

PRs target `main`; this repo has no `dev` branch. Railway builds the Dockerfile,
runs `npx prisma migrate deploy` as its pre-deploy command and health-checks
`/health`. Details and the env-var inventory in
[`docs/operations.md`](docs/operations.md).

## Post-task workflow

1. **Tests first** for new code — see Testing above.
2. **Run the gate** — `npm run verify`.
3. **Review against this repo's invariants** —
   [`.claude/skills/vault-code-review/SKILL.md`](.claude/skills/vault-code-review/SKILL.md),
   then `/coderabbit:review` if the change is nontrivial.
4. **Log a lesson if you hit one** — a nontrivial correction or a non-obvious
   gotcha goes into [`docs/lessons.md`](docs/lessons.md), following that file's
   own instructions. A lesson nobody writes down gets rediscovered by the next
   agent at the same cost.
