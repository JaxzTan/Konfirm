# Board: Konfirm (MUBA Hack 2026)
> created: 2026-09-03 | updated: 2026-09-03 | sessions: 1 | deadline: 09-05 submit · 09-06 pitch @ APU

**Goal:** `/api/attest` end-to-end on testnet by 09-03 freeze: Google login → scrubbed trace on Walrus → Verdict object with blob_id + trace_hash → verify page proves hash match.
**Next action:** 3 — add `trace_hash: vector<u8>` to Verdict, redeploy, update `NEXT_PUBLIC_PACKAGE_ID`

## Steps
| # | Step | Prio | Status | Due | Updated |
|---|------|------|--------|-----|---------|
| 1 | Wallet: Enoki provider tree merged, Google login → zkLogin address, confirm-before-sign | high | done | 09-02 | 09-03 |
| 2 | `lib/walrus.ts`: scrub → canonical sha256 → PUT publisher → parse blobId; `fetchTrace` verifies hash | high | done | 09-03 | 09-03 |
| 3 | Move: add `trace_hash` field to `Verdict`, `submit_verdict` takes blob_id + hash; redeploy testnet | high | todo | 09-03 | — |
| 4 | `/api/attest`: draftId → uploadTrace → tx → index in Prisma; test with mock `submittedBy` | high | todo | 09-03 | — |
| 5 | Verify page: `fetchTrace(blobId, traceHash)` → show "hash verified" / mismatch banner + aggregator link | med | todo | 09-03 | — |
| 6 | Walrus fallback: if publisher 5xx/timeout, store trace in Prisma, `blob_id=""`, verdict still written, UI shows "trace pending" | med | todo | 09-03 | — |
| 7 | Feature freeze — no new code after 09-03; smoke checklist ×3 | high | todo | 09-03 | — |

## Notes
### 2 — lib/walrus.ts
- [09-03] Immutability/public read come from content addressing; security = server-only upload + scrub-before-upload + on-chain sha256 binding + never `deletable=true`.
- [09-03] Public publisher owns the Blob Sui object → cannot extend epochs later. Set `WALRUS_EPOCHS` high enough for demo + judging window.
### 4 — /api/attest
- [09-03] Signing path locked to Option A / R-1 fallback: server attester keypair signs, zkLogin address passed as `submitted_by`. Enoki sponsorship allowlist not needed for this path.

## Blockers
—

## Scope changes
- [09-03] + Added step 6: Walrus testnet quota still unconfirmed; verdict must not fail because trace upload failed.

## Waiting on
- Jayci: Move `konfirm::registry` deployed? (needed for step 3 — if not deployed by 09-03 noon, Jaxz deploys)
- Gilbert: `/api/health` sponsor + Gonka balance
- Jack: verify page `/v/[objectId]` RSC skeleton (step 5 plugs into it)
