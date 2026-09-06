# Encryption

Everything sensitive in this service is encrypted with AES-256-GCM before it
reaches Postgres, by three functions in
[`src/crypto/encryption.ts`](../src/crypto/encryption.ts). The surface is
deliberately small: `encrypt`, `decrypt`, and the field helpers in
[`token-service.ts`](../src/services/token-service.ts) that wrap them.

## The envelope

```
{iv_hex}:{ciphertext_base64}:{auth_tag_hex}
```

- AES-256-GCM, key = `ENCRYPTION_KEY` parsed as 32 bytes of hex (64 hex chars,
  enforced at boot by the zod schema in `validateEnvVars.ts`).
- IV: 12 random bytes per encryption. Never reused, never derived.
- Auth tag: 16 bytes. `decrypt` sets it before finalizing, so a tampered
  ciphertext **throws** rather than returning garbage — that behaviour is what
  the tamper tests in `encryption.test.ts` pin.
- `decrypt` rejects anything that is not exactly three colon-separated parts.

**This format is a stored-data contract.** Every row in `tokens` and every
`code_verifier` in `oauth_pending_states` is in it. There is no versioning
prefix, so a change that cannot read the old format orphans every token in
production, irreversibly: the plaintext exists nowhere else, and the customer
has to re-authorize each connector by hand. If the format ever has to change,
the way to do it is to make `decrypt` accept both, ship that first, migrate, and
only then change `encrypt`.

## What is encrypted, and what is not

| Encrypted | Plaintext |
|---|---|
| `access_token`, `refresh_token` | `customer_id`, `provider` |
| `client_id`, `client_secret` | `token_type`, `expires_at`, `scopes`, `token_uri` |
| `code_verifier` (both tables) | `created_at`, `updated_at`, everything in `audit_logs` |

The plaintext column set is what `getTokenStatus` and `listCustomerTokens`
return, and that is the point: a caller can ask "is this customer connected to
Google, and is the token stale?" without anything decrypting. Keep new columns
on the correct side of that table — if a value would be useful to an attacker
who dumped the database, it belongs in the encrypted column set.

`audit_logs.metadata` is a free-form JSON column. It is plaintext. Never put a
token, a verifier or a client secret in it.

## Key rotation

**There is no rotation tooling in this repository.** Read that sentence again
before you promise anyone a rotation window.

`ENCRYPTION_KEY` is read once per process through `getConfig()` and used for
both encryption and decryption, so changing it makes every existing row
undecryptable. A real rotation needs, in this order:

1. A dual-key read path — `decrypt` tries the current key, then the previous one
   (`ENCRYPTION_KEY_PREVIOUS`). Ship and deploy this first.
2. A re-encryption job that reads every `tokens` row, decrypts with whichever
   key works, re-encrypts with the new key, and writes it back — in batches,
   idempotently, with the service still serving traffic.
3. Removal of the previous key once the job reports zero rows on the old key.

None of those three exist today. Until they do, treat `ENCRYPTION_KEY` as
permanent for a given environment, and treat its leak as an incident that
requires re-authorization of every customer connector rather than a key swap.

`RAGEN_TOKEN_VAULT_SERVICE_SECRET` is different and much easier: it protects
requests, not stored data. Rotating it means updating the secret in this
service and in every caller (`ragen-app`, `ragen-connectors`) close together;
requests signed with the old secret start failing with `Invalid signature` the
moment the vault restarts, so do it in a low-traffic window or add a
second-accepted-secret path first.

## Rules

- A decrypted value never reaches a log, a span attribute, an error body, an
  audit row or a test fixture. Tests generate their own key with
  `crypto.randomBytes(32).toString("hex")`; never commit a real one.
- Encryption happens in the service layer, never in a route handler and never in
  a Prisma call site. Routes deal in wire shapes, services deal in secrets.
- `encryptOptional` / `decryptOptional` map empty and null to `null` — a new
  optional secret column uses them rather than hand-rolling the null check.
