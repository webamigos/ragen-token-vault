# Service-to-service authentication

Every route except `/health` and the Google OAuth callback is behind
`serviceAuthHook` ([`src/auth/service-auth.ts`](../src/auth/service-auth.ts)).
This document is the specification a calling service implements against. It is
a **cross-repo contract**: `ragen-app` (`packages/vault-client`) and
`ragen-connectors` both sign requests this way, and a change here is a
coordinated release, not a refactor.

## The signature

```
message   = "{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}"
signature = hex(HMAC-SHA256(RAGEN_TOKEN_VAULT_SERVICE_SECRET, message))
header    = Authorization: HMAC-SHA256 ts={ts},sig={signature}
```

Five details, each of which is a 401 when a client gets it wrong:

| Element | Rule |
|---|---|
| `ts` | Unix seconds, as a string. Must be within **±5 minutes** of server time. |
| `METHOD` | Uppercase, exactly as sent (`PUT`, `GET`, `DELETE`, `POST`). |
| `path` | Path only — the server signs `request.url.split("?")[0]`. **Never include the query string.** |
| body hash | `sha256` hex of the **raw request bytes**. Not of a re-serialized object, not of a pretty-printed copy. |
| GET / DELETE | Sign the hash of an **empty string**, `e3b0c442…7852b855`, regardless of what the client sends. |

The header is parsed with `/^HMAC-SHA256 ts=(\d+),sig=([0-9a-f]+)$/i` — one
space, a comma, no extra whitespace, lowercase-or-uppercase hex. The comparison
is `crypto.timingSafeEqual` over the decoded bytes, after a length check.

`X-Service-Name` identifies the caller (`ragen-app`, `ragen-connectors`) and is
written to every audit row. It defaults to `"unknown"` when absent.

## Worked example

Secret `dev-secret-at-least-32-characters-long`, timestamp `1767225600`. These
are **test vectors for checking a signing implementation**, not a request you
can replay: `ts` is part of the HMAC input and is validated against a ±5-minute
window, so a live caller generates a current timestamp and recomputes `sig` for
every request.

```
PUT /v1/tokens/cust_42/GOOGLE
body        = {"access_token":"ya29.example"}
body_sha256 = 8e86693193b3b872fc3171138f7f7a02330ca8e69060b0f8845988e988f92db2
message     = "1767225600\nPUT\n/v1/tokens/cust_42/GOOGLE\n8e8669…92db2"
sig         = 08ee8d5e775ec0ded6cfd77ec52b2d788bd567262147e2da148738ba9381ecb8
```

```
GET /v1/tokens/cust_42
body_sha256 = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855   (empty)
sig         = 945cc16718fa4f7a937bcb76ea71c28b322f3d824cab5247129d8a4735c9f4d4
```

Reproduce either with:

```bash
node -e 'const c=require("crypto");const b=process.argv[4]??"";
const h=c.createHash("sha256").update(b).digest("hex");
console.log(c.createHmac("sha256",process.argv[1]).update(`${process.argv[2]}\n${process.argv[3]}\n${process.argv[5]}\n${h}`).digest("hex"))' \
  "<secret>" "<ts>" "<METHOD>" "<body>" "<path>"
```

## Why the raw body matters

`buildServer()` installs a custom `application/json` content-type parser that
keeps the raw string on `request.rawBody` before parsing it. The hook hashes
that string. This is the reason a client cannot sign `JSON.stringify(obj)` and
then send a differently-serialized body — key order, spacing and unicode
escaping all change the hash.

It is also why **adding a content-type parser without capturing `rawBody`
breaks authentication** for that content type: `rawBody` is `undefined`, the
hook hashes `""`, and every signed request gets a 401 whose message says only
`Invalid signature`.

## Known limits

These are deliberate, documented, and worth knowing before you rely on them:

- **One shared secret for all callers.** There is no per-service key, so a
  caller cannot be revoked individually and any holder of the secret can send
  any `X-Service-Name`. The audit trail records a *claim*, not a verified
  identity.
- **No nonce.** A captured request can be replayed within the 5-minute window.
  The window is the only replay defence.
- **No rate limiting.** Nothing in the service throttles a caller that holds a
  valid secret; the body limit (1 MiB) is the only inbound bound.

If any of these becomes unacceptable, it is a design change with a matching ADR
and a coordinated client release — not a quiet patch.

## Failure responses

All are `401` with a JSON `error` field: `Missing Authorization header`,
`Invalid Authorization header format`, `Request timestamp out of range`,
`Invalid signature`. They deliberately do not say which part of the message
mismatched. When debugging a caller, reproduce the expected signature locally
with the snippet above rather than adding detail to the response.
