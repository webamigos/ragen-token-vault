# Contributing to Ragen Token Vault

Thanks for wanting to help. This service holds every customer's OAuth tokens and
API keys for the whole Ragen platform, encrypted at rest. That makes it the most
security-sensitive repo we have, and this guide leans on that: read the
"Four things that catch everyone" section before you touch crypto or auth.

Working with a coding agent here? [`AGENTS.md`](AGENTS.md) is the canonical
brief — it carries the same rules as this guide plus the cross-service
contracts, and [`docs/lessons.md`](docs/lessons.md) catalogs the gotchas that
already cost someone an afternoon.

## Before you start

- **Bugs and small fixes** — open a PR directly. No need to ask first.
- **Anything touching encryption, the HMAC scheme, or the token schema** — open
  an issue first. These changes ripple into every calling service.
- **Security vulnerabilities** — do **not** open an issue. See
  [SECURITY.md](SECURITY.md).

## Branch model

- `main` — the integration and release branch. **Base your work here and target
  it in PRs.** Every commit on `main` is deployable.
- Topic branches — one per change, named `feat/…`, `fix/…`, `chore/…`,
  `refactor/…` or `docs/…`.

## Getting set up

Node.js 24.x (see `.nvmrc`) and Docker.

```bash
docker compose up -d       # local Postgres
cp .env.example .env
npm install
npm run generate:types     # generate the Prisma client — required before anything builds
npx prisma migrate dev
npm run dev                # tsx watch, port 3100
```

`npm run generate:types` is not optional. The Prisma client is gitignored and
generated into `src/generated/prisma/`, so a fresh checkout has no client at all
and nothing will compile.

## Before you open a PR

Run the same gate CI runs — one command:

```bash
npm run verify             # generate types → lint → test → build
```

## Four things that catch everyone

**1. `instrument.ts` must be imported before everything else.** `src/index.ts`
imports it on the first line to set up OpenTelemetry. OTEL patches modules at
import time, so if any other import lands first, that module is never
instrumented and you silently lose its traces. Don't reorder those imports, and
don't add an import above it.

**2. Changing the HMAC scheme breaks every caller at once.** Service-to-service
auth signs `HMAC(secret, "{ts}\n{method}\n{path}\n{body_sha256}")` and identifies
the caller by `X-Service-Name`. ragen-app and ragen-connectors both construct
that string independently. If you change the format, the signature stops
matching for all of them simultaneously and every token lookup fails — plan it
as a coordinated, two-sided rollout, not a single PR here.

**3. Changing the ciphertext format orphans existing data.** Tokens are stored
as `{iv_hex}:{ciphertext_b64}:{auth_tag_hex}` (AES-256-GCM). Rows written under
the old format cannot be read under a new one, and there is no plaintext copy to
fall back on — a customer whose token can't be decrypted has to re-authorize
from scratch. Any change here needs a migration path that can read both formats
during the transition.

**4. Never log a decrypted value.** Not at debug level, not in an error message,
not in a trace attribute, not in a test fixture that gets committed. The audit
log records *that* a token operation happened, never the token. Pino redaction
is not a safety net you get to rely on — don't put the value in the log call in
the first place.

## Local imports need `.js` extensions

The repo is ESM-only (`"type": "module"`, Node16 resolution). Write
`import { getConfig } from "./config.js"` even though the file is `config.ts`.

## Tests

New code needs tests, especially around crypto and auth. Tests run under Vitest
with `globals: true`, so `describe`/`it`/`expect` need no import.

```bash
npx vitest run src/crypto/encryption.test.ts   # a single file
```

Use a real local Postgres for anything touching Prisma. Never point a test at a
production database, and never commit a real secret as a fixture — generate key
material inside the test.

## Code conventions

- TypeScript strict mode, ES2022 target, Node16 module resolution
- ESLint enforces `curly: "error"` — always brace your control flow
- Config through the `getConfig()` singleton, the database through `getDb()` —
  don't read `process.env` or construct a Prisma client directly
- Shared types live in `src/types/index.ts`
- New env vars go in the Zod schema in `src/validateEnvVars.ts` **and** in
  `.env.example`. The service refuses to boot if a required one is missing,
  which is the behaviour we want.

## Commits and PRs

We use [Conventional Commits](https://www.conventionalcommits.org/). Releases
are cut by semantic-release from `main`, so the commit type determines the
version bump.

```
feat(tokens): support per-provider expiry overrides
fix(auth): reject signatures with a timestamp outside the tolerance window
docs: document the ciphertext storage format
```

In the PR description, say what changed and why, and what you ran to convince
yourself it works. Link the issue with `Fixes #123`.

## Licensing

Contributions are accepted under the [Apache License 2.0](LICENSE), the same
license that covers the project. By opening a pull request you confirm you have
the right to contribute the code and agree to license it under those terms.
