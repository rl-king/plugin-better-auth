---
"@strapi-community/plugin-better-auth": patch
---

fix(adapter): support Better Auth 1.7

Better Auth 1.7 consumes single-use values (verification tokens, email OTPs,
magic links, password reset tokens) through a new atomic `consumeOne` adapter
method. Adapters without a native implementation get a generic fallback that
guards its delete with every field of the row it read, including Strapi's own
`documentId`, `publishedAt` and `locale`. Better Auth doesn't know those fields,
so every OTP, magic-link and password-reset sign-in failed with
`Field documentId not found in model verification`.

The adapter now implements `consumeOne` natively: it reads the row through the
Document Service and deletes it with a single Query Engine `DELETE`, returning
the row only when that statement removed it, so a value is used at most once
even under concurrent requests.

`update` now resolves to `null` instead of throwing when no row matches, as
Better Auth's adapter contract expects.
