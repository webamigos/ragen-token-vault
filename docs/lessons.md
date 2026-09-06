# Lessons

A catalog of non-obvious corrections and gotchas from this repository, indexed
so an agent (or a human) can check the relevant area before starting nontrivial
work in it, instead of re-discovering the same bug. Same mechanism as
`ragen-app`'s `docs/lessons.md`.

## How to use this catalog

Before a nontrivial task, skim the bullets under the area(s) it touches — not
the whole catalog. Each bullet links to a lesson file with four fixed sections:
**Context** (what was happening), **Problem** (what went wrong, concretely),
**Rule** (the durable takeaway), **Applies to** (scope).

## Adding or updating a lesson

After a nontrivial correction or a non-obvious gotcha (see `AGENTS.md`'s
"Post-Task Workflow"):

1. Check whether an existing lesson already covers it — extend that file rather
   than creating a near-duplicate.
2. Otherwise add `docs/lessons/<kebab-case-slug>.md` with the front matter
   (`title`, `modules`, `areas`, `topics`) and the four-section shape any
   existing lesson shows.
3. Add one bullet to the relevant `### <area>` section below, with the commit or
   PR that is the evidence. A lesson without evidence is an opinion.

## Catalog

### deployment

- [Railway's private network is IPv6-only, so a service bound to 0.0.0.0 is unreachable while looking healthy](lessons/railway-private-networking-is-ipv6-only.md) — area:deployment; module:config,docker; topic:railway,ipv6,fastify,dns. Evidence: `e4ad9fe` (PR #9).
- [A generated client that lives outside `dist/` has to be placed in the runtime image by hand — four fix commits proved it](lessons/a-generated-client-outside-dist-must-be-placed-by-hand.md) — area:deployment,build; module:docker,db; topic:prisma,docker,tsc,file-permissions. Evidence: `4f7eb0a`, `c1641d7`, `0c76b6c`, `d0ddbb0`.

### local-dev

- [Every Ragen repo publishes Postgres on a different port, and the docs drifted from the compose file that defines it](lessons/local-postgres-port-collides-across-repos.md) — area:local-dev; module:docker,docs; topic:docker-compose,postgres,ports,docs-drift. Evidence: `e3a625a` (PR #14), plus the `.env.example` that still said 5432/5433 afterwards.

### ci

- [The coverage comment on a PR depends on a reporter in `vitest.config.ts`, not on anything visible in the workflow](lessons/the-coverage-comment-depends-on-a-vitest-reporter.md) — area:ci; module:ci; topic:vitest,coverage,github-actions,implicit-contracts. Evidence: `ae155dd`, `fa3232f` (PRs #11, #12).
