# Plan v1 — Walrus (FR-9 / TR-10 / R-2)

**Owner:** Jaxz · **Drafted:** 2026-09-03 · **Freeze:** 09-03 · **Submit:** 09-05 · **Pitch:** 09-06

**Scope:** everything between "a verdict has been computed" and "anyone can independently re-read the reasoning trace and prove it wasn't edited." Walrus upload, PII scrub, integrity binding, read-back on the verify page, and the failure path when the testnet publisher is down.

---

## 0. Read this first — the three root drafts don't match this repo

`konfirm-board.md`, `walrus.ts` and `route.ts` are sitting untracked at the repo root. They contain good thinking, but they were written against a **different architecture** than the one that exists. Copying them in as-is will not compile and would silently undo work that is already done and verified.

| The draft assumes                                                       | This repo actually is                                                                                         | Consequence                                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@/lib/prisma`, `draft` + `verdict` tables                              | **No Prisma, no database.** TRD §3 line 15: 「**没有关系型数据库** —— 链是唯一的真相来源」                    | `route.ts` cannot run. Its `draftId` flow has nothing to read from                                                                      |
| `${PKG}::verdict::submit_verdict` + `AttesterCap`                       | Deployed module is `registry::create_verdict`, **no capability gate** (TRD §4.1: exactly two entry functions) | Target doesn't exist on chain                                                                                                           |
| Server attester keypair signs; zkLogin address passed as `submitted_by` | User's own zkLogin wallet signs, gas sponsored by Enoki. Built, and the sponsor path is verified working      | Abandons FR-12 and the acceptance criterion "gas payer ≠ user". TRD §4 line 46 says 「Walrus 上传 → 构造 tx → **sponsor 签名** → 执行」 |
| `SuiClient` + `getFullnodeUrl` from `@mysten/sui/client`                | JSON-RPC is dead industry-wide since 2026-07-31; repo uses `SuiGrpcClient`                                    | Every call returns "Method not found"                                                                                                   |
| `claim_text` stored on chain                                            | Deliberately removed — NFR-4 violation                                                                        | Puts user PII on an immutable ledger                                                                                                    |
| `submitted_by` as a tx argument                                         | `create_verdict` uses `ctx.sender()`                                                                          | Redundant, and forgeable                                                                                                                |
| `WALRUS_PUBLISHER_URL` / `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL`            | Env vars are `WALRUS_PUBLISHER` / `NEXT_PUBLIC_WALRUS_AGGREGATOR` (no `_URL`)                                 | Silently falls back to hardcoded defaults                                                                                               |
| `import "server-only"`                                                  | That package was uninstalled                                                                                  | Build error                                                                                                                             |

**What the drafts get right and this repo is missing** — this is the actual work below: `epochs`, a size cap, an upload timeout, deterministic canonical bytes, an integrity hash, read-back verification, and a failure path.

> **Decision needed before W3.** `konfirm-board.md` locks the signing path to "Option A: server attester keypair." That contradicts FR-12, TRD §4, and roughly a day of sponsorship work that is already green. This plan assumes **the existing sponsored zkLogin path stays**. If the board is the newer decision, say so before W3 — it changes W3, W4 and the Move module.

---

## 1. Verified against the live testnet — 2026-09-03

Everything below was probed directly, not assumed.

| Probe | Result |
|---|---|
| `PUT /v1/blobs?epochs=5` | **200**, but took **10.4s** |
| Aggregator read-back | **200 in 1.9s**, bytes returned intact |
| Same bytes uploaded twice | **Same `blobId`** — content addressing confirmed. But the response was `newlyCreated` *both* times, not `alreadyCertified`: a fresh Blob **object** is minted each time even though the blob ID is identical |
| `epochs=53` | OK — `startEpoch 509 → endEpoch 562` |
| `epochs=100` / `999` | **Rejected**, `EInvalidEpochsAhead`. **53 is the cap** |
| `deletable=false` | **Silently ignored** — the object still comes back `deletable: true` |

Testnet epoch is 1–2 days, so 53 epochs is roughly 53–106 days — comfortably past 09-06. **W1 is not a risk; just pass `epochs=53`.**

---

## 2. Blockers

### B1 · Blobs are `deletable: true` and we don't own them — HARD

The public publisher stamps `"deletable": true` on every blob and keeps the Blob object under its own address (`0x7f7edc2e…`). Passing `deletable=false` changes nothing. `konfirm-board.md` says "Do NOT pass deletable=true" — with this publisher that instruction cannot be followed.

So "permanent, cannot be deleted" is **not a claim we can make**. What we *can* prove, and what actually answers the FR-9 user story, is: the blob ID is derived from the content, and the chain records that ID — so nobody can swap the trace for a different one without it being obvious. That is **tamper-evident**, not **permanent**.

Options: (a) reword the pitch to the tamper-evidence claim — free, honest, still strong; (b) run our own publisher with a funded WAL wallet so we own the Blob objects — real work, not freeze-day work. **Recommend (a), plus W6 so an unavailable trace degrades gracefully.**

### B2 · The verify page has no chain read at all — HIGH

`next/app/v/[objectId]/page.tsx` is 268 lines of `mockContent`, with `// TODO: replace with a real Sui fullnode read` at line 66. W5 was written as "plug `fetchTrace` into Jack's skeleton" — but there is nothing to plug into: the page never fetches a `Verdict` object, so there is no `blobId` to read. **Reading the Verdict from chain is unscoped work that gates W5**, and it is not on `konfirm-board.md` either.

### B3 · 10s upload vs the serverless timeout — HIGH

The publisher took 10.4s for a 30-byte payload; a real trace will be slower. There is no `vercel.json` and no `maxDuration` export anywhere, so `/api/attest` runs on the platform default. It works locally and fails only once deployed — the worst way to find out.

### B4 · Two mutually exclusive signing paths — DECISION

As in §0: `konfirm-board.md` locks "server attester keypair"; the repo, FR-12 and TRD §4 say sponsored zkLogin. Gates W3.

### B5 · R-2's fallback target may not exist — MEDIUM

TRD R-2 says fall back to Vercel Blob. Nobody has confirmed it is provisioned. Gates W6.

---

## 3. What's actually wrong with Walrus today

`next/lib/attest/walrus.ts` is 23 lines and works, but:

| #   | Defect                                                                                      | Why it matters                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | **No `epochs` parameter.** `PUT /v1/blobs` with no query string takes the publisher default | A blob that expires before 09-06 takes the whole demo with it. This is the highest-risk item in this document                                                             |
| b   | No `Content-Type` header, body is `JSON.stringify(...)`                                     | Bytes are whatever `JSON.stringify` happens to emit — key order is insertion order, so the same verdict can produce two different blobs                                   |
| c   | No size cap                                                                                 | A long multi-model trace can be rejected by the publisher mid-demo with no useful error                                                                                   |
| d   | No timeout                                                                                  | A hung publisher hangs `/api/attest` until the platform kills it, after the user already pressed confirm                                                                  |
| e   | Nothing ever reads a blob back                                                              | `NEXT_PUBLIC_WALRUS_AGGREGATOR` is set in `.env` and referenced **nowhere in the codebase**. FR-9's promise — anyone can go read the reasoning — is currently unfulfilled |
| f   | No failure path                                                                             | If the publisher 5xxs, `/api/attest` throws and no Verdict is written at all. The verdict is the valuable part; the trace is the evidence                                 |

---

## 4. Tasks

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                    | Ref               | Depends                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| W1 | Add `epochs` to the upload: `PUT /v1/blobs?epochs=53`, via a `WALRUS_EPOCHS` env var. **53 is the verified cap** (§1) — roughly 53–106 days, far past 09-06 | R-2, defect (a) | — |
| W2  | Make the uploaded bytes deterministic: canonical JSON (sorted keys, recursive) → `TextEncoder` → single `Uint8Array`, sent with `Content-Type: application/octet-stream`. Add a 256 KB cap and a 20s `AbortController` timeout                                                                                                                                                                                          | defects (b)(c)(d) | —                       |
| W3  | Bind the trace to the chain. Walrus blob IDs are already content-derived — the same bytes produced the same `blobId` on both probes in §1 — so `trace_blob` is _itself_ a commitment. Decide: rely on that (zero Move changes), or add `trace_hash: vector<u8>` to `Verdict` and redeploy. **Recommend: rely on the blob ID for v1.** Adding a field means a redeploy, a new `PACKAGE_ID`, and re-doing the Enoki allowlist on freeze day | FR-9, TR-13       | decision above          |
| W4  | `fetchTrace(blobId)` — read from `NEXT_PUBLIC_WALRUS_AGGREGATOR`, re-derive the commitment, return `ok` / `unavailable` / `mismatch`. Server-side, cached (`next: { revalidate: 3600 }`)                                                                                                                                                                                                                                | FR-9, defect (e)  | W2                      |
| W5 | Wire W4 into `/v/[objectId]`: render the trace, an explicit "trace verified" or "unavailable" banner, and a direct aggregator link so a judge can bypass our UI entirely | FR-9, FR-10 | W4, **W8** |
| W6  | Fallback when the publisher fails. **TRD R-2 already specifies this**: fall back to Vercel Blob and store `sha256(trace)` in `trace_blob`; integrity still verifiable, and we say plainly in the pitch that it's a testnet limitation. (`konfirm-board.md` step 6 proposes Prisma instead — there is no Prisma)                                                                                                         | R-2, defect (f)   | W1–W3                   |
| W7 | Fold `redactDeep` into the upload path so scrubbing provably happens **before** hashing and before the bytes leave the process, and unit-test the TR-10 patterns: `+60…`, `01x-…`, `990101-14-1234`, email, `wa.me` links | TR-10, NFR-4 | W2 |
| W8 | Read the `Verdict` object from chain in `/v/[objectId]`, replacing `mockContent` — this is B2, and W5 cannot start without it | FR-10, B2 | — |
| W9 | `export const maxDuration = 60` on `/api/attest`, and confirm the hosting plan permits it | B3 | — |

**Not in scope:** replacing `next/lib/attest/redact.ts` with the draft's `scrubPII`. They do the same job; the draft adds `wa.me` links and a local `01x` phone format, which is a 4-line addition to the existing file, not a rewrite.

---

## 5. Acceptance checklist

Run in order. Stop on the first failure.

| #   | Check                                                                                          | How                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1 | Uploading the same verdict twice returns the **same** blob ID | Call `/api/attest` twice with identical input and compare `blobId`. Do **not** assert on `alreadyCertified` — the publisher returns `newlyCreated` both times (§1) |
| 2   | A scrubbed field never reaches Walrus                                                          | Put a Malaysian IC in the claim, fetch the blob from the aggregator, grep for it                    |
| 3   | The blob is still readable from the aggregator with **no auth and no Konfirm code**            | `curl $NEXT_PUBLIC_WALRUS_AGGREGATOR/v1/blobs/<blobId>`                                             |
| 4   | The blob outlives the judging window                                                           | Answered in §1: `epochs=53` is the cap, roughly 53–106 days. Just confirm the request actually sent it                              |
| 5   | Verify page shows "trace verified" on a good blob, and a mismatch banner if bytes are tampered | Point `fetchTrace` at a different blob ID and confirm the UI degrades honestly                      |
| 6   | Publisher down ⇒ Verdict is still created                                                      | Point `WALRUS_PUBLISHER` at a dead host; the on-chain write must still succeed with the W6 fallback |

Check 3 is the one that matters for the pitch: it is the difference between "trust our app" and "verify it yourself."

---

## 6. Sequencing

```
W1 epochs ─┐
W2 bytes ──┼─→ W7 scrub-before-hash ─→ W3 binding decision ─→ W6 fallback
           └─→ W4 fetchTrace ─→ W5 verify page UI
```

W1, W2 and W9 are independent and cheap; do them first. W8 is the largest unscoped item and gates W5 — start it early, or cut W5.

---

## 7. Open questions

| Question                                                                                                              | Owner   | Needed by |
| --------------------------------------------------------------------------------------------------------------------- | ------- | --------- |
| Does the board's "server attester keypair" decision supersede the sponsored zkLogin path? They are mutually exclusive | Jaxz    | before W3 |
| Reword the pitch to "tamper-evident" rather than "permanent" (B1)? | Jaxz | before pitch |
| Who owns W8, the chain read on the verify page (B2)? | Jaxz / Jack | 09-03 |
| Is Vercel Blob provisioned for this project, so R-2's fallback can actually be exercised?                             | Gilbert | before W6 |

---

## 8. Execution status — 2026-09-03

Ran everything that doesn't wait on a blocker decision.

| # | Status | Note |
|---|---|---|
| W1 | ✅ | `epochs=53` (the verified cap), via `WALRUS_EPOCHS`; clamped in code so a bad env value can't exceed it |
| W2 | ✅ | `canonicalize` sorts keys at every depth, `Content-Type: application/octet-stream`, 256 KB cap checked before the network call, 20s `AbortSignal.timeout` |
| W3 | ✅ no-op | Went with the recommendation: rely on the content-derived blob ID. No Move change, no redeploy, no allowlist churn |
| W4 | ✅ | `fetchTrace(blobId)` + `blobUrl(blobId)`. Returns `ok` / `unavailable` / `malformed` — **no `mismatch` state**, because asking the aggregator for an ID and getting a 200 *is* the integrity check |
| W5 | ⏸ | Blocked on W8 / B2 |
| W6 | ⏸ | Blocked on B5 |
| W7 | ✅ | `redactDeep` runs before the bytes are derived, so scrubbing provably precedes both hashing and upload. Added the local `01x-…` phone form and `wa.me` links to TR-10's patterns; 9 tests |
| W8 | ⏸ | Blocker B2 |
| W9 | ✅ | `export const maxDuration = 60` on `/api/attest` |

### One real bug caught, and only by the live test

The first implementation sent `body: new Blob([bytes])` — needed to satisfy TypeScript's `BodyInit`. The unit test passed because it inspected `init.body` directly. Against the live publisher it uploaded **the literal string `[object Blob]`**, 13 bytes, and the publisher stored it and returned 200 with a perfectly valid blob ID. The upload result even reported the correct `size`, because that was computed locally from the real bytes.

Nothing short of reading the blob back would have caught it, and on freeze day it would have shipped as "every trace is corrupt but every status code is green." Fixed by sending the `Uint8Array` directly, and the unit test now asserts the body **is** a `Uint8Array`, not just that it decodes correctly.

### Verified
- 33 tests pass (was 8) · `tsc` clean · `oxlint` clean · `next build` clean
- Live round trip against Walrus testnet: upload a redacted trace → read it back through the aggregator → bytes identical, and the planted phone number and email are absent from what came back

