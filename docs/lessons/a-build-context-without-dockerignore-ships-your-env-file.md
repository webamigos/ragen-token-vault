---
title: "A repository with no .dockerignore hands `.env.local` to every image build, and nothing about the build says so"
modules: ['docker', 'ci']
areas: ['deployment', 'security']
topics: ['docker', 'build-context', 'secrets', 'ghcr', 'dockerignore']
---

# A repository with no .dockerignore hands `.env.local` to every image build, and nothing about the build says so

**Context**: the Dockerfile's builder stage is `COPY . .` — the ordinary shape
for a TypeScript service that has to run `prisma generate` and `tsc` over the
whole tree. This repository had no `.dockerignore` at all until image
publishing was added. Railway built that Dockerfile on every deploy and nothing
ever failed.

**Problem**: without a `.dockerignore`, the build context is the working
directory, and here that includes `.env.local` — which holds a **real**
`ENCRYPTION_KEY` and `RAGEN_TOKEN_VAULT_SERVICE_SECRET`, the two values that
decrypt every customer's tokens and forge any caller's signature. It was
uploaded to the daemon and written into a builder-stage layer on every local
`docker build`. The runner stage copies only `dist`, `node_modules`,
`package.json` and `prisma/`, so the secret did not reach the final image — the
repository was one `COPY --from=builder /app .` or one debug build away from
publishing its own encryption key to a public registry, with no test, lint rule
or review checklist positioned to notice. Publishing to GHCR is what makes the
blast radius permanent: a pushed layer is world-readable and cannot be recalled.

**Rule**: in this repository `.dockerignore` is an access control, not a build
optimisation. It lists `.env`, `.env.local` and `.env.*.local` first, and those
lines are not negotiable when someone trims the file for build speed. Before
adding a `COPY` to the runner stage, ask what else the builder stage is holding.
The same reasoning covers `src/generated` and `dist`: both are rebuilt inside
the image, so a stale host copy shadowing a fresh one is a real failure mode,
just a quieter one.

**Applies to**: [`Dockerfile`](../../Dockerfile),
[`.dockerignore`](../../.dockerignore) and
[`publish-images.yml`](../../.github/workflows/publish-images.yml). Any Ragen
repository whose Dockerfile does `COPY . .` and whose `.env.local` is a live
credential — which is all of them.
