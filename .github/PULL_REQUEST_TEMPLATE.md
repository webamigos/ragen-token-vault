<!-- PRs target `main`. See CONTRIBUTING.md. -->

## What and why

What changed, and what problem it solves. If there's an issue, link it with
`Fixes #123`.

## How it was verified

What you actually ran, and what it said.

## Checklist

- [ ] Targets `main`
- [ ] `npm run build` passes (includes `prisma generate`)
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] Tests added or updated for the changed behaviour
- [ ] **No decrypted token value reaches a log, span attribute, error body or
      test fixture**
- [ ] **If this touches `src/crypto/`:** the `{iv}:{ciphertext}:{tag}` format is
      unchanged, or a migration path that reads both formats is included
- [ ] **If this touches `src/auth/`:** the HMAC string format is unchanged, or
      the coordinated rollout across ragen-app and ragen-connectors is described
      above
- [ ] **If this touches a token query:** it is scoped by `customer_id` and
      `provider`, never by `customer_id` alone
- [ ] **If this changes `prisma/schema.prisma`:** a migration is included, and
      `npm run generate:types` was run
- [ ] **If this adds an env var:** it's in `src/validateEnvVars.ts` and in
      `.env.example`
- [ ] **If this adds an import to `src/index.ts`:** it is below the
      `instrument.ts` import
- [ ] Docs updated where the change makes them wrong (README, CLAUDE.md)
