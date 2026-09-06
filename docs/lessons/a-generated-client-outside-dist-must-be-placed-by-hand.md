---
title: 'A generated client that lives outside dist/ has to be placed in the runtime image by hand — four fix commits proved it'
modules: ['docker', 'db']
areas: ['deployment', 'build']
topics: ['prisma', 'docker', 'tsc', 'file-permissions']
---

# A generated client that lives outside `dist/` has to be placed in the runtime image by hand

**Context**: `prisma/schema.prisma` generates the client into
`src/generated/prisma/` (gitignored), `tsc` compiles `src/` into `dist/`, and
the Dockerfile builds in one stage and copies artifacts into a slim runner
stage. Each of those three is reasonable alone.

**Problem**: together they need four separate corrections, and each one surfaced
only at runtime or at image-build time — never in `npm run build`, which is
green throughout:

- `4f7eb0a` — the pre-deploy `prisma migrate deploy` needs `prisma.config.ts`
  and `prisma/` inside the image. The build stage has them; the runner stage did
  not.
- `c1641d7` — the copy landed at `./src/generated`, but the running code is
  `dist/index.js` resolving `./generated/prisma/client.js` relative to `dist/`.
  Moved to `./dist/generated`.
- `0c76b6c` — a runner-stage `npx prisma generate` was still needed, plus a
  `chown` so the non-root user could read what it produced.
- `d0ddbb0` — that `chown` targeted `node_modules/.prisma`, which does not exist
  under Prisma 7 with the `prisma-client` generator and a custom output path.
  `chown` on a missing path is a non-zero exit, so the **image build** failed.

Worth knowing for the next change: `tsc` does emit `src/generated/**/*.ts` into
`dist/generated/`, so the copy is not redundant only for the `.js` — it is what
carries the non-TypeScript assets the generator emits alongside them
(`wasm-*-loader.mjs`), which the compiler never touches.

**Rule**: a generated, gitignored directory under `src/` is not part of any
artifact until something copies it there, and every artifact needs its own
answer — the Docker image, the CI job, a fresh clone. When you change the
generator output path, the `outDir`, or the Dockerfile, walk all three. And
prefer `chown -R … <path>` only on paths you have just verified exist in that
stage; a defensive `chown` of a directory a dependency used to create is a build
failure waiting for the next major version.

**Applies to**: `Dockerfile`, `tsconfig.json` (`outDir`/`rootDir`),
`prisma/schema.prisma`'s `generator.output`, and any future move to a different
Prisma engine or adapter.
