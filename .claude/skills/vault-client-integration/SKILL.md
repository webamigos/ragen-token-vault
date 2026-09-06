---
name: vault-client-integration
description: Implement or debug a service that calls ragen-token-vault — computing the HMAC signature, and diagnosing a 401 (Invalid signature, timestamp out of range, header format). Use when working on packages/vault-client in ragen-app, a connector in ragen-connectors, or any caller that gets 401s from the vault. Triggers on "vault client", "401 from vault", "Invalid signature", "HMAC nie działa".
---

# Calling the vault, and debugging a 401

The full specification is [`docs/service-auth.md`](../../../docs/service-auth.md).
The reference implementation is `computeSignature` in
[`src/auth/service-auth.ts`](../../../src/auth/service-auth.ts) — read it, do not
reimplement from memory.

## The five ways a client gets it wrong

The server answers every failure with a 401 and a message that deliberately does
not say which part mismatched. In practice it is one of these, in this order of
likelihood:

1. **The query string was signed.** The server signs
   `request.url.split("?")[0]`. A client that signs the full URL fails on every
   request that has a parameter and succeeds on every request that does not —
   which reads like an intermittent bug.
2. **The body was re-serialized.** The hash is over the raw bytes on the wire.
   Signing `JSON.stringify(obj)` and then letting an HTTP library serialize
   `obj` again changes key order or spacing, and the hashes differ.
3. **GET or DELETE signed a non-empty body.** Those methods always sign
   `sha256("")` = `e3b0c442…7852b855`, whatever the client sends.
4. **Clock drift.** More than ±5 minutes and the request is rejected before the
   signature is even computed. Check the container clock, not the code.
5. **Header grammar.** `Authorization: HMAC-SHA256 ts={unix_seconds},sig={hex}`
   — one space, one comma, no spaces around it, `ts` in **seconds** not
   milliseconds. The regex is `/^HMAC-SHA256 ts=(\d+),sig=([0-9a-f]+)$/i`.

Also send `X-Service-Name` (`ragen-app`, `ragen-connectors`). It is not
authenticated — it only labels the audit row — but every operation on a customer
token gets logged with it, and `unknown` in the audit trail is a debugging dead
end later.

## Diagnosing, concretely

Do not add logging to the vault. Reproduce the expected signature locally and
compare it with what the client sent:

```bash
node -e 'const c=require("crypto");const b=process.argv[4]??"";
const h=c.createHash("sha256").update(b).digest("hex");
console.log(c.createHmac("sha256",process.argv[1]).update(`${process.argv[2]}\n${process.argv[3]}\n${process.argv[5]}\n${h}`).digest("hex"))' \
  "$RAGEN_TOKEN_VAULT_SERVICE_SECRET" "$(date +%s)" "GET" "" "/v1/tokens/cust_42"
```

If that signature is accepted and the client's is not, the difference is in the
four inputs — print the client's exact `message` string (not the secret) and
diff it character by character. A trailing newline or a `%2F`-encoded path
segment is the usual culprit.

The vault's own tests in `src/auth/service-auth.test.ts` are the cheapest place
to reproduce a signing bug: add the failing case there, red, then fix the client.

## When the fix is in the vault

If the contract itself has to change — a nonce, per-caller secrets, a wider
window — that is a coordinated release across `ragen-app`,
`ragen-connectors` and this service, and the vault has to accept both schemes
during the rollout. A one-sided change takes every connector down at once. Say
that in the PR body and get it acknowledged before merging.
