# Security Policy

Ragen Token Vault stores every customer's OAuth tokens and API keys for the
Ragen platform, encrypted with AES-256-GCM. A compromise here is a compromise of
every connected third-party account — Google, HubSpot, ClickUp and anything else
a customer has authorized. We treat reports against this service as our highest
priority.

## Reporting a vulnerability

**Do not open a public issue.** Report privately to **security@webamigos.pl**, or
through GitHub's [private vulnerability
reporting](https://github.com/webamigos/ragen-token-vault/security/advisories/new).

Include what you have — a partial report is better than none:

- what the vulnerability is, and which route or layer it affects
- steps to reproduce, or a proof of concept
- the impact you think it has, and who it affects
- a suggested fix, if you have one

## What to expect

| Step | Timeline |
|---|---|
| Acknowledgement that we received your report | 48 hours |
| Initial assessment and severity classification | 7 days |
| A fix timeline communicated back to you | 14 days |
| Patch released | Critical: as fast as we can. High: 30 days. Medium/low: next release. |

We will keep you updated as it moves, and credit you in the release notes unless
you would rather stay anonymous.

## Scope

**In scope** — this service exists to protect secrets, so most things are:

- **any path that returns a token to a caller not entitled to it** — in
  particular one `customer_id` or `provider` reaching another's row. Tokens are
  keyed on `(customer_id, provider)`; anything that lets those be confused or
  traversed is critical.
- weaknesses in the HMAC-SHA256 service authentication: signature forgery,
  replay of a captured request, timestamp-tolerance abuse, non-constant-time
  comparison, or any way to reach an authenticated route without passing
  `serviceAuthHook`
- weaknesses in the AES-256-GCM implementation: IV reuse, unauthenticated
  decryption, auth-tag bypass, padding or format confusion in the
  `{iv}:{ciphertext}:{tag}` encoding
- key management flaws — anything that exposes the encryption key or a service
  secret through logs, traces, error responses, the audit log, or an endpoint
- leakage of decrypted token material anywhere: log lines, OTEL span attributes,
  stack traces, HTTP error bodies
- OAuth flow weaknesses in the Google callback: state handling, code
  interception, redirect validation, or pending-state fixation
- audit-log tampering or suppression — an operation that succeeds without
  leaving a record
- SQL injection, SSRF, RCE, and the rest of the usual list

**Out of scope:**

- findings that require an attacker to already hold a valid service secret or
  the encryption key. If you can obtain either of those, *that* is the finding —
  report the path, not its consequences.
- denial of service through sheer volume, and rate-limit tuning
- vulnerabilities in the upstream OAuth providers themselves — report those to
  the provider; tell us if our integration makes it worse
- results from an automated scanner with no demonstrated exploit
- missing hardening headers with no demonstrated impact

## Deployment note

This service is self-hosted: **you** run it, so you own patching. Watch releases
for security fixes.

Three deployment properties matter more than anything in the code:

- **Every authenticated route trusts the HMAC secret alone.** There is no user
  session and no second factor. Anyone holding a service secret can read any
  token that service is allowed to read, so treat those secrets like the tokens
  they unlock: unique per calling service, rotated, never in a repo.
- **The encryption key is not recoverable and not escrowed.** Lose it and every
  stored token is permanently undecryptable; every customer must re-authorize.
  Leak it and your database dump becomes plaintext. Back it up separately from
  the database — a backup containing both defeats the encryption entirely.
- **Do not expose this service to the internet.** It is meant to sit on a
  private network reachable only by ragen-app and ragen-connectors. `/health`
  and the Google OAuth callback are the only unauthenticated routes, and the
  callback is the only one that ever needs public reachability.

A vulnerability in a dependency of your own deployment (your Postgres, your
reverse proxy) is yours to patch, not ours — but tell us if our defaults made it
worse, because that is a bug in our defaults.
