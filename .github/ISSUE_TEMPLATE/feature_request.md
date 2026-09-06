---
name: Feature request
about: Propose a change or addition
labels: feature
---

## The problem

What can't you do today, and what does that cost you? Describe the situation
rather than the solution — it often turns out there's a better fix than the one
that first comes to mind.

## What you have in mind

## What you've already tried or considered

Including workarounds, and why they aren't enough.

## Who this is for

- [ ] A new OAuth provider
- [ ] Callers of the vault (ragen-app, ragen-connectors)
- [ ] Operators running a self-hosted deployment
- [ ] Contributors / developer experience

## Anything else

<!--
Two constraints shape what can land here:

1. This service is deliberately narrow. It stores and returns secrets, and does
   as little else as possible — every additional responsibility widens the blast
   radius of a compromise. Proposals that move business logic into the vault are
   unlikely to land.

2. The HMAC auth format and the AES-256-GCM ciphertext format are contracts.
   ragen-app and ragen-connectors sign requests independently, and stored rows
   cannot be re-encrypted without the plaintext. Anything that changes either
   needs a two-sided rollout plan, not just a PR.
-->
