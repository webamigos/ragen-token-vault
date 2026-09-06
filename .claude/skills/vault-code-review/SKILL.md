---
name: vault-code-review
description: Review a change against this repository's own invariants — the HMAC and ciphertext contracts, route registration as the authorization model, plaintext-vs-encrypted column sets, no decrypted value in a log, and what the mocked-database tests cannot prove. Use before opening a PR, when reviewing one, and before claiming a change here is safe. Triggers on "review", "przejrzyj", "code review", "czy to jest gotowe do merge".
---

# Reviewing a change here

Generic review advice is available everywhere. This is the list of things
specific to the token vault, ordered by blast radius. Run `npm run verify`
first — lint, tests and build. Everything below is what the gate cannot check.

## 1. Did this change a contract another repository depends on?

Three things leave this repo and land in `ragen-app` and `ragen-connectors`:

- **The HMAC message format** (`{ts}\n{METHOD}\n{path}\n{sha256(body)}`), the
  header grammar, the ±5-minute window, path-without-query, raw-body hashing.
- **The ciphertext envelope** (`{iv}:{ciphertext_b64}:{tag}`).
- **The wire shapes** — snake_case field names, `/v1/` paths, status codes.

A PR that touches `src/auth/`, `src/crypto/` or a route's request/response shape
must either leave the contract byte-identical or describe the coordinated
rollout in the PR body. There is no test in this repo that fails when you break
a caller. Ask explicitly: *what does `packages/vault-client` do when this ships
first?*

For the envelope specifically: a change that cannot read the **old** format
orphans every token in production. The plaintext exists nowhere else. The only
acceptable shape is read-both → migrate → write-new.

## 2. Where was the route registered?

Registration position is the authorization model. Anything added at the top
level of `buildServer()` is public. Only `/health` and
`/v1/oauth/google/callback` belong there, and the callback is protected by the
single-use, 10-minute, PKCE-bound `state` row — check that a change has not
extended the TTL, made the state reusable, or skipped the delete on success.

Also check the content-type parsers: the custom `application/json` parser is
what populates `request.rawBody` for signature verification. A new parser
without `rawBody` capture means silent 401s for that content type.

## 3. Did a secret escape?

- No decrypted value in a log, a span attribute, an error response, an audit row
  or a test fixture. `audit_logs.metadata` is plaintext JSON — tokens must never
  land there.
- New columns: is this value one an attacker would want from a database dump? If
  yes it belongs in the encrypted set (`encryptField`/`encryptOptional`), not
  beside `scopes` and `expires_at`.
- `getTokenStatus` and `listCustomerTokens` return metadata only. A change that
  makes either return token material is the bug this service exists to prevent.
- Secret comparisons use `crypto.timingSafeEqual`, never `===`.

## 4. Is the query scoped?

Token reads and writes are keyed by `(customerId, provider)` — the composite
unique. `listCustomerTokens` is the one intentional by-customer query and it
returns no ciphertext. A new query taking only `customerId` and returning token
material is a cross-customer leak, not a convenience.

## 5. Layering

Routes validate with zod and map snake_case ⇄ camelCase. Services own
encryption, Prisma and outbound HTTP. A route that calls `encrypt` or `getDb`
directly, or a service importing Fastify types, is the change that makes the
crypto surface untestable. Encryption belongs in the service layer, always.

## 6. What the tests did not prove

Every test here mocks the database. A changed query shape will be asserted
against a mock that agrees with it, and only `prisma migrate deploy` in CI
touches real Postgres. When a change alters a Prisma call, read the generated
types rather than trusting the green suite.

Required with a change:

- crypto → round-trip **and** tamper test (flipped byte must throw).
- auth → the rejection paths, not just the happy one.
- routes → the zod rejection, since validation is the only thing between the
  wire and a service.

## 7. Env and migrations

A new env var must be in `src/validateEnvVars.ts` **and** `.env.example` —
`getConfig()` exits on invalid env, which is the desired behaviour and must stay
that way. A migration must be safe to apply *before* the new code runs: Railway
runs `prisma migrate deploy` pre-deploy, so a rename in the same deploy that
starts using the new name takes the service down.

## 8. Before saying it is ready

- Conventional Commit subject? `semantic-release` derives the version from it,
  and a squash merge parses the PR title.
- Did anything non-obvious bite you? Add it to `docs/lessons.md`.
- Docs that the change makes wrong: `README.md`, `AGENTS.md`, `docs/*`, and
  `.env.example` if a port, default or variable moved.
