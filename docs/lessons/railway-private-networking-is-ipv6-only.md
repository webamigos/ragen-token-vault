---
title: "Railway's private network is IPv6-only, so a service bound to 0.0.0.0 is unreachable while looking healthy"
modules: ['config', 'docker']
areas: ['deployment']
topics: ['railway', 'ipv6', 'fastify', 'dns']
---

# Railway's private network is IPv6-only, so a service bound to 0.0.0.0 is unreachable while looking healthy

**Context**: the vault started with `HOST` defaulting to `0.0.0.0`, the
conventional "listen on everything" value for a containerized Node service. It
deployed cleanly on Railway, logged `ragen-token-vault listening on
0.0.0.0:3100`, and passed its own health check.

**Problem**: `0.0.0.0` is every **IPv4** interface. Railway's private network
between services is IPv6-only, so `ragen-token-vault.railway.internal` resolves
to an address the process was not listening on. Callers got connection
failures against a service whose logs, health check and metrics all said it was
up — the failure is entirely on the client side of the link, so nothing in the
vault's own telemetry hints at it. The same asymmetry applies outbound: Node's
default DNS ordering can hand back an IPv4 address for an internal hostname that
only answers over IPv6.

`e4ad9fe` fixed both directions: `HOST` now defaults to `::` (dual-stack, which
accepts IPv4 too on Linux), and the Dockerfile sets
`NODE_OPTIONS="--dns-result-order=ipv6first"` for outbound resolution.

**Rule**: on Railway, bind `::` and resolve IPv6-first. Both settings are no-ops
on an IPv4-only network, which is exactly why they look like noise and get
"simplified" away by someone tidying a Dockerfile or an `.env.example`. When a
service is reachable publicly but not from a sibling service, check what it is
bound to before you check anything else — and read "listening on 0.0.0.0" as
"not listening on the private network".

**Applies to**: every Ragen service deployed on Railway, and the
`.env.example`/`validateEnvVars.ts` pair that carries the default. If a caller
reports timeouts against `*.railway.internal`, start here.
