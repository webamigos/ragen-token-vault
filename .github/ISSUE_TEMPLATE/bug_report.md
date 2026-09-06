---
name: Bug report
about: Something behaves incorrectly
labels: bug
---

<!--
Security vulnerabilities do NOT belong here — see SECURITY.md.
This service holds customer secrets; a bug in it is often a security issue.
If you are unsure which this is, report it privately.
-->

## What happens

## What you expected instead

## How to reproduce

1.
2.
3.

## Which layer

- [ ] Service auth (HMAC)
- [ ] Encryption / decryption
- [ ] Token CRUD
- [ ] Google OAuth flow
- [ ] Audit log
- [ ] Database / migrations
- [ ] Observability (OTEL, logging)

## Environment

- Version or commit:
- Node version: <!-- must be 24.x -->
- Deployment: <!-- local dev / Docker / Railway -->
- Calling service, if any: <!-- the X-Service-Name value -->

## Logs

**Redact everything sensitive before pasting: tokens, secrets, encryption keys,
signatures and customer identifiers.**

<details>
<summary>Logs</summary>

```
```

</details>

## If this is an auth failure

- Does `/health` respond?
- Is the failure a 401 on every route, or only some?
- Are the caller's and the vault's clocks in sync? Signatures embed a timestamp
  and are rejected outside a tolerance window.

## If this is a decryption failure

**Do not paste ciphertext or key material.** Tell us instead:

- Was the row written by the same deployment that is failing to read it?
- Has the encryption key been rotated or the deployment recreated?
- Does it affect one provider, one customer, or everything?
