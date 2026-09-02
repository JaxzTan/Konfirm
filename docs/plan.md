# Plan: Enoki Integration — P1 / P2 Split

**Scope:** Everything needed to close the gap between the current code state and `docs/Enoki_setup.md`, mapped onto PRD FR-8→FR-13 and TRD TR-9/TR-12/TR-13 (TRD item #11, the single **L**-sized task).

**Note on ownership vs. PRD §8:** the PRD assumption is "链上工作 100% 由 Jaxz 承担,队友不碰 Sui SDK" (100% of on-chain work stays with Jaxz; the teammate doesn't touch the Sui SDK). This plan splits the Enoki work into two people anyway, per this request. To keep that PRD assumption intact where it matters, the split below draws the line at the Sui SDK: **P1 owns everything that touches keys, the Portal, and the Move-call allowlist; P2 owns UI that only reads `useCurrentAccount`/`useSignAndExecuteTransaction` state, never raw signing logic.** If P2 is the non-Web3 teammate, re-check this line before assigning.

---

## P1 — Portal, keys, sponsorship correctness

Owns: Google Cloud Console, Enoki Portal, `.env` secrets, and undoing the backend sponsor-route approach the code currently has (which `Enoki_setup.md` Step 5 explicitly says this project doesn't need).

| # | Task | Ref | Depends |
|---|---|---|---|
| 1 | Google Cloud Console: create OAuth web client, add `http://localhost:3400` + prod domain to Authorized JS origins and redirect URIs, add all demo Google accounts to Test users | Enoki_setup.md §1 | — |
| 2 | Enoki Portal: create app `konfirm` (never delete/recreate — salt is per-app, FR-11 identity stability), generate public + private API keys scoped to testnet | Enoki_setup.md §2.1–2.2 | 1 |
| 3 | Register Google as an Auth Provider in the Portal using the client ID from #1 | Enoki_setup.md §2.3 | 1, 2 |
| 4 | Configure the sponsored-tx allowlist on the private key with **only** `PACKAGE_ID::registry::create_verdict` once the Move package (TR-9) is deployed. Do **not** allowlist `registry::challenge`: PRD FR-13 says challenge is signed by P3's own wallet, self-paid — "不接 zkLogin、不接 sponsored tx". Sponsoring it would both contradict FR-13 and widen the gas-drain surface that #8 exists to close | Enoki_setup.md §2.4, TR-9, TR-13, FR-13 | Move package deploy |
| 5 | Fill `.env`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_ENOKI_API_KEY`, `ENOKI_SECRET_KEY` (server-only, never `NEXT_PUBLIC_`) | NFR-2 | 2 |
| 6 | **Remove** `app/api/enoki/sponsor`, `app/api/enoki/execute`, `lib/enoki/server.ts`, `lib/enoki/sponsoredTransaction.ts` — this manual `EnokiClient` round trip is the flow Enoki_setup.md says to skip; sponsorship should be automatic via the Portal allowlist (#4) once the sender is an Enoki-wallet account | Enoki_setup.md §5 (explicit warning) | 4 |
| 7 | Confirm `/api/attest` (FR-9, FR-12) builds the transaction and calls `useSignAndExecuteTransaction` directly, gas paid by the sponsor account, no custom sponsor endpoint in between | TR-12, TR-13, FR-12 | 6, Move package |
| 8 | Rate-limit `/api/attest` (3 req/min/IP) so the sponsor's testnet SUI can't be drained | TR-13, NFR-2 | 7 |
| 9 | `/api/health` check for sponsor balance + Gonka balance, per demo checklist | TRD §9, §5 | 7 |
| 10 | Redeploy checklist item: update Portal allowlist every time the Move package is republished (new `PACKAGE_ID`) | Enoki_setup.md §2.4 warning | 4 |

---

## P2 — Wallet UI, identity surface, sign-flow UX

Owns: the parts of the app that render account state and collect the user's action to sign — reads from dapp-kit hooks, never touches keys or the Portal.

| # | Task | Ref | Depends |
|---|---|---|---|
| 1 | Replace bare `<ConnectButton />` in `app/page.tsx` with a custom `<GoogleLogin />` component (filter `useWallets()` for the Enoki Google wallet via `isEnokiWallet`, plain "Sign in with Google" button, no wallet jargon) | Enoki_setup.md §4.2, NFR-5 (P2 persona is 58yo, no crypto literacy) | P1 #1–3 (needs a working client ID to test against) |
| 2 | Add `lib/signer.ts` → `useKonfirmIdentity()` wrapping `useCurrentAccount` + `useDisconnectWallet`, replacing whatever mock identity interface exists today | Enoki_setup.md §6 | 1 |
| 3 | Build the "confirm before you post this on-chain" UI — Enoki signs with **no wallet confirmation popup**, so this is the only safety net before a real tx fires | Enoki_setup.md gotcha #1 | 1, P1 #7 |
| 4 | Wire the confirm UI + `useSignAndExecuteTransaction` into the actual "存证 & 分享" (attest & share) button in the verdict flow (FR-11/FR-12 user story) | FR-11, FR-12, User flow step 5 | 3, P1 #7 |
| 5 | Verify `import '@mysten/dapp-kit/dist/index.css'` stays present (already in `app/providers.tsx`) — losing it makes the connect modal render unstyled | Enoki_setup.md gotcha #6 | — |
| 6 | Logout affordance using `useDisconnectWallet` from #2, shown once `useCurrentAccount()` is non-null | Enoki_setup.md §6 | 2 |

---

## Shared acceptance checklist (Enoki_setup.md §"验收标准")

Run in order; stop and fix on first failure — do not proceed past a broken step.

| # | Check | Owner to verify |
|---|---|---|
| 1 | `<GoogleLogin />` opens the Google popup | P2 |
| 2 | After login, `useCurrentAccount()` returns a `0x...` address | P2 |
| 3 | That address shows **0 SUI** balance on Sui testnet explorer | P1 |
| 4 | Calling the real entry function (e.g. `registry::create_verdict`) returns a digest | P1 + P2 |
| 5 | Transaction details show the gas payer is **not** the user address | P1 |
| 6 | Same Google account, logged in again, returns the **same** address | P2 |

\#3 and \#5 together are the actual proof that sponsorship works — everything else can look right and still be silently unsponsored.

---

## Sequencing

```
P1: GCP → Portal app/keys → Auth provider → .env
                                              │
                       (parallel) ────────────┼──────────── P2: custom GoogleLogin UI, needs #1–3 to test
                                              │
                                   Move package deployed (TR-9, separate track)
                                              │
                                   P1: allowlist config → remove manual sponsor routes → confirm auto-sponsorship
                                              │
                                   P2: confirm-before-sign UI → wire into attest flow
                                              │
                                   Both: run the 6-step acceptance checklist
```

P1 items 1–3, 5 and P2 item 1, 5 can start immediately in parallel. Everything past that gates on the Move package being deployed on testnet (separate TRD item #9, not in this plan).
