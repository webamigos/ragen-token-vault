---
title: 'Every Ragen repo publishes Postgres on a different port, and the docs drifted from the compose file that defines it'
modules: ['docker', 'docs']
areas: ['local-dev']
topics: ['docker-compose', 'postgres', 'ports', 'docs-drift']
---

# Every Ragen repo publishes Postgres on a different port, and the docs drifted from the compose file

**Context**: a developer typically has `ragen-app` and `ragen-token-vault`
checked out at once, each with its own `docker compose` Postgres, and often a
native Postgres on 5432 as well.

**Problem**: the vault originally published `5433:5432`. That collides with
whatever else is holding 5433, and the failure mode is not a clean error —
whichever container grabbed the port first answers, so `prisma migrate dev` runs
successfully against the **wrong database** and reports success. `e3a625a` moved
the publish to `${POSTGRES_PORT:-5435}`, matching the convention `ragen-app`
uses (55432 for the app, 55433 for LiteLLM).

The second half is the part that lasted longer: `.env.example` continued to say
`DATABASE_URL=…localhost:5432/…` with a commented alternative on 5433 — neither
of which is what the compose file publishes. A developer copying it got a
connection to a different database or to nothing, from a file whose whole
purpose is to be copied. It was corrected only when this catalog was written.

**Rule**: the compose file is the source of truth for a published port, and
every place that repeats it (`.env.example`, `README.md`, `CONTRIBUTING.md`,
`AGENTS.md`) is a copy that will drift. When you change a port, grep for the old
number across the repo before committing. And when a local database behaves as
if your migration never ran, check *which* Postgres you are talking to
(`psql "$DATABASE_URL" -c '\conninfo'`) before debugging the migration.

**Applies to**: `docker-compose.yml`, `.env.example`, and the local-development
sections of `README.md`, `CONTRIBUTING.md` and `AGENTS.md`.
