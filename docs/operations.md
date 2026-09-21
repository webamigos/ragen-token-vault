# Operations

## Environment

Validated by the zod schema in
[`src/validateEnvVars.ts`](../src/validateEnvVars.ts). `getConfig()` prints the
formatted error and calls `process.exit(1)` on anything invalid, so a bad env is
a boot failure, never a runtime surprise. Every new variable goes in that schema
**and** in `.env.example`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Must be a URL. Local compose publishes Postgres on **5435** |
| `ENCRYPTION_KEY` | yes | — | Exactly 64 hex chars = 32 bytes. Effectively permanent, see [`encryption.md`](encryption.md#key-rotation) |
| `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | yes | — | ≥32 chars, shared with every caller |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | `""` | Only the OAuth routes need them |
| `GOOGLE_REDIRECT_URI` | no | `http://localhost:3100/v1/oauth/google/callback` | Must match the Google console entry exactly |
| `PORT` | no | `3100` | |
| `HOST` | no | `::` | Dual-stack. Load-bearing on Railway — see below |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | Unset disables all OTEL export |
| `OTEL_SERVICE_NAME` | no | `ragen-token-vault` | |
| `TARGET_ENV` | no | `local` | Becomes `deployment.environment.name` |
| `GIT_COMMIT_SHA` | no | — | Becomes `service.version`, defaults to `dev` |

## Deployment (Railway)

[`railway.toml`](../railway.toml) builds the Dockerfile, runs
`npx prisma migrate deploy` as the pre-deploy command, health-checks `/health`
with a 10 s timeout and restarts on failure up to three times.

Two things in the image exist for reasons that are not obvious:

- **`HOST` defaults to `::`.** Railway's private network is IPv6-only. A service
  bound to `0.0.0.0` is unreachable at `*.railway.internal` while looking
  perfectly healthy in its own logs. The Dockerfile pairs this with
  `NODE_OPTIONS=--dns-result-order=ipv6first` for outbound resolution. Both are
  no-ops on an IPv4-only network — do not "simplify" them away.
- **The generated Prisma client is placed by hand.** It is generated into
  `src/generated/`, which is outside `dist/`, so the runner stage copies it to
  `dist/generated`, copies `prisma/` and `prisma.config.ts` for the pre-deploy
  migration, re-runs `prisma generate`, and chowns `node_modules/@prisma` for the
  non-root `fastify` user. Four separate fix commits produced that sequence; see
  [`lessons.md`](lessons.md).

The migration runs **before** the new container serves traffic, so a migration
must be backwards-compatible with the currently-running version: add columns
before writing them, and never rename a column in the same deploy that starts
using the new name.

## Health

`GET /health` runs `SELECT 1` through Prisma and returns `200 {status:"ok"}` or
`503 {status:"unhealthy"}`. It is a database-connectivity check, not a
readiness signal for the OAuth providers, and it deliberately returns no
diagnostic detail — it is a public endpoint.

## Observability

With `OTEL_EXPORTER_OTLP_ENDPOINT` set, `src/instrument.ts` exports traces
(`BatchSpanProcessor`, HTTP and `pg` auto-instrumented), metrics
(`PeriodicExportingMetricReader`, 30 s) and logs (Pino bridged through
`BatchLogRecordProcessor`) to `<endpoint>/v1/{traces,metrics,logs}`. Unset, the
whole module is inert. Shutdown flushes all three via `shutdownOtel()` in the
SIGTERM/SIGINT handler.

Span attributes are subject to the same rule as logs: no decrypted values, no
tokens, no `code_verifier`.

## Container images

Every GitHub release publishes `ghcr.io/webamigos/ragen-token-vault` from
[`publish-images.yml`](../.github/workflows/publish-images.yml), mirroring how
`ragen-app` publishes its apps. Railway still builds the Dockerfile itself —
the image is for self-hosters and for `ragen-deploy`, whose
`docker-compose.onprem.yml` already pulls
`${REGISTRY:-ghcr.io/webamigos}/ragen-token-vault:${RAGEN_TOKEN_VAULT_VERSION:-latest}`.
That name is a contract: renaming the package breaks that compose file.

**The first publish creates the package as private.** GHCR inherits nothing
from the repository being public, so until somebody flips it in the package
settings (Package settings → Danger Zone → Change visibility), an anonymous
`docker pull` gets a 404 that reads like the image was never built.

```bash
docker pull ghcr.io/webamigos/ragen-token-vault:latest
```

Tags per release: `X.Y.Z`, `X.Y`, `sha-<full-commit-sha>` and `latest`. Pin a
deployment to the sha tag — `latest` moves, and so does `X.Y`.

Three things about it are deliberate:

- **The release event comes from `semantic-release`, which authenticates with
  the `GH_TOKEN` PAT.** A release created with the default `GITHUB_TOKEN` does
  not trigger another workflow, and nothing would ever be published. Switching
  `release.yml` to `GITHUB_TOKEN` silently stops the images.
- **Each architecture is built natively** — `linux/amd64` on `ubuntu-latest`,
  `linux/arm64` on the free `ubuntu-24.04-arm` runner — pushed by digest under
  no tag, and joined into one manifest list by the `merge` job. A per-arch
  build that pushed a tag would race the other one and leave a
  single-architecture image behind a tag that claims both; the final step
  re-inspects the published manifest for exactly that reason.
- **[`.dockerignore`](../.dockerignore) is a security control, not a build
  optimisation.** The builder stage is `COPY . .`, and `.env.local` holds a
  real `ENCRYPTION_KEY` and service secret. Do not remove those lines.

To re-run a publish, dispatch the workflow **on the tag**, never on a branch —
`metadata-action` reads `github.ref`, so a dispatch from `main` produces no
semver tags at all:

```bash
gh workflow run publish-images.yml --ref v1.2.3
```

## CI and releases

[`ci.yml`](../.github/workflows/ci.yml) runs lint → test → build on pull
requests and pushes to `main`. The test job provisions a real Postgres 16
service and runs `prisma migrate deploy` against it; the unit tests themselves
mock the database, so that step is the only thing proving the migrations apply.
Coverage is posted as a PR comment and a step summary, both fed by the
`json-summary` reporter configured in `vitest.config.ts`.

[`release.yml`](../.github/workflows/release.yml) runs `semantic-release` on
every push to `main`, using the `GH_TOKEN` secret. The version and the GitHub
release come from the **commit subjects**: `feat:` → minor, `fix:` → patch,
everything else → no release. With squash merges the PR title is what gets
parsed, so a merge titled `Update stuff` ships nothing.
