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
| 6 | ~~**Remove** the manual `EnokiClient` sponsor round trip~~ — **REVERSED, see the correction note below.** The server-side sponsor route is *required*; `app/api/sponsor` + `lib/enoki/sponsor.ts` are the correct implementation and must NOT be deleted | Enoki_setup.md §5 is wrong on this point | — |
| 7 | ✅ `/api/attest` (FR-9, FR-12): rate-limit → PII-redact (TR-10) → Walrus upload → return the `create_verdict` args. It does **not** sign or sponsor; the client builds the tx kind, `/api/sponsor` wraps it, the Enoki wallet signs, `/api/sponsor/execute` submits | TR-12, TR-13, FR-12 | Move package |
| 8 | ✅ Rate-limit `/api/attest` **and** `/api/sponsor` (3 req/min/IP) so the sponsor's gas pool can't be drained | TR-13, NFR-2 | 7 |
| 9 | ✅ `/api/health` — Enoki app + Google provider, package exists on-chain, allowlist string to paste, Walrus/Gonka/client-ID config. Note: sponsor SUI balance is **not observable** (gas comes from Enoki's pool, not an address we own) and Gonka exposes no balance endpoint; the endpoint says so rather than faking it | TRD §9, §5 | 7 |
| 10 | ✅ Redeploy checklist written up in [`docs/redeploy.md`](./redeploy.md) — republishing mints a new `PACKAGE_ID`, which silently un-sponsors everything until the Portal allowlist is updated and the app is **rebuilt** (`NEXT_PUBLIC_*` is inlined at build time) | Enoki_setup.md §2.4 warning | 4 |

> **Correction to #6 and #7 (2026-09-02).** Both assumed sponsorship happens automatically once a target is allowlisted. It does not. In `@mysten/enoki` 1.2.19 the wallet registered by `registerEnokiWallets` exposes only `sui:signTransaction` / `sui:signAndExecuteTransaction`, and both build gas against the *user's* address — which holds 0 SUI. Sponsorship lives behind `EnokiClient.createSponsoredTransaction`, which requires the private API key and therefore a server. A backend sponsor route is **required**, not optional; see Enoki_setup.md Step 5 (rewritten) and `next/lib/enoki/sponsor.ts`.
>
> **Correction to #4.** The two targets listed are wrong on both names and count. The deployed module is `registry`, the function is `create_verdict`, and `registry::challenge` must **not** be allowlisted — PRD FR-13 says challenges are self-paid through an ordinary wallet.

---

## ⚠️ Correction to P1 #6 — the wallet cannot self-sponsor

This plan (and `Enoki_setup.md` §5) assumed that once a Move target is
allowlisted in the Portal, an Enoki wallet's transactions are sponsored
automatically, making a server-side sponsor route unnecessary. **That is not
true of `@mysten/enoki` 1.2.19.** Verified in the installed SDK:

- `dist/wallet/wallet.mjs` exposes only `sui:signTransaction` and
  `sui:signAndExecuteTransaction`; both do
  `parsedTransaction.build({ client })` (lines 115 and 124), which builds
  against the **user's own address**. A zkLogin account holds 0 SUI, so the
  build fails for want of a gas coin.
- `grep -i sponsor dist/wallet/wallet.mjs` returns **nothing**. The wallet has
  no sponsorship path at all.
- The only sponsorship API is `EnokiClient.createSponsoredTransaction`
  (`dist/EnokiClient/index.mjs:70` → `POST transaction-blocks/sponsor`), which
  requires `ENOKI_SECRET_KEY` and therefore a server.

So the correct flow is a three-step round trip, not a direct client call:

```
/api/attest        → Walrus blob + create_verdict args
client             → build transaction KIND bytes (no gas, no sender coins)
/api/sponsor       → EnokiClient.createSponsoredTransaction → { bytes, digest }
Enoki wallet       → signs those bytes
/api/sponsor/execute → EnokiClient.executeSponsoredTransaction → digest
```

Acceptance checks #3 and #5 still hold and are still the real proof: the user
address stays at 0 SUI and the gas payer is Enoki's pool, not the user.

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

---

## 执行状态 · 2026-09-02

**P2 全部完成** —— `GoogleLogin`、`lib/signer.ts`、confirm-before-sign 步骤、attest 按钮接线、dapp-kit CSS、`AccountBadge` 登出，均已在代码里。

**P1**

| # | 状态 | 备注 |
|---|---|---|
| 1 | ✅ | redirect URI 需为 `https://localhost:3400/login`（带路径、https、3400），见 Enoki_setup.md §1.3 |
| 2 | ✅ | `/api/health` 实测 `getApp()` 通过 |
| 3 | ✅ | 同上，`providers: google` |
| 4 | ✅ | 实测 `POST /api/sponsor` 返回 200 + 已填 gas 的 bytes，说明 Portal allowlist 已生效 |
| 5 | ✅ | 注意 Next.js 读的是 `next/.env`，不是仓库根目录的 `.env` |
| 6 | ⛔️ 已推翻 | 见上方 correction —— 后端赞助路由是必需品，已按正确形态重建 |
| 7 | ✅ | `/api/attest` 只负责 Walrus + 参数；上链走 `useSignAndExecuteTransaction` → `/api/sponsor` |
| 8 | ✅ | `/api/attest` 与 `/api/sponsor` 各 3 req/min/IP |
| 9 | ✅ | `GET /api/health`。两项 TRD §9 要的数字取不到，响应里如实写明：Enoki gas pool 不是我们的地址所以没有 sponsor 余额可读；Gonka 没有余额接口 |
| 10 | ✅ | checklist 写在 Enoki_setup.md 末尾 |

**验收标准剩余项**：1、2、6 由 P2 在浏览器点一遍；3 和 5 需要一笔真实交易后在 testnet explorer 上看 gas payer —— 这是唯一还没被自动化覆盖的证据。
