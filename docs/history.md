# History

## 2026-09-01 — Sui Enoki integration

### Dependencies installed
- `@mysten/enoki` — zkLogin / sponsored transaction SDK
- `@mysten/sui` — core Sui SDK (v2, gRPC-first)
- `@mysten/dapp-kit` — wallet/React hooks
- `@tanstack/react-query` — peer dep required by dapp-kit
- `server-only` — guards server-only module from client bundles

### Files added
- `app/providers.tsx` — `QueryClientProvider` + `SuiClientProvider` + `WalletProvider`, registers Enoki as a wallet-standard wallet for Google zkLogin via `registerEnokiWallets`, re-registering on network change per the docs' recommended pattern (`useSuiClientContext`, mounted above `WalletProvider`).
- `lib/enoki/server.ts` — server-only lazy `EnokiClient` singleton (`getEnokiClient()`), reads `ENOKI_SECRET_KEY` at call time (not import time) so the build doesn't fail when the key is unset.
- `app/api/enoki/sponsor/route.ts` — POST endpoint wrapping `EnokiClient.createSponsoredTransaction`.
- `app/api/enoki/execute/route.ts` — POST endpoint wrapping `EnokiClient.executeSponsoredTransaction`.
- `lib/enoki/sponsoredTransaction.ts` — client helper `signAndExecuteSponsoredTransaction()` running the full round trip: build tx-kind bytes → POST `/api/enoki/sponsor` → wallet signs via `useSignTransaction` → POST `/api/enoki/execute`.

### Files modified
- `app/layout.tsx` — wrapped `children` in `<Providers>`.
- `app/page.tsx` — added `<ConnectButton />` (triggers Google OAuth zkLogin popup) and displays the connected account address via `useCurrentAccount()`.
- `.env` — added `NEXT_PUBLIC_ENOKI_API_KEY` (public key, client-side) alongside the pre-existing `ENOKI_SECRET_KEY` (private key, server-side) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- `package.json` / `package-lock.json` — updated by the installs above.

### Notes / gotchas hit during setup
- `@mysten/dapp-kit` only supports the old JSON-RPC Sui client shape; `@mysten/sui` v2's default `./client` subpath is gRPC-first and doesn't export `SuiClient`/`getFullnodeUrl` anymore. Fixed by importing `getJsonRpcFullnodeUrl` and the JSON-RPC `NetworkConfig` shape from `@mysten/sui/jsonRpc` instead.
- `toB64` doesn't exist in `@mysten/sui/utils` anymore — it's `toBase64`.
- `EnokiClient` must not throw at module-eval time if `ENOKI_SECRET_KEY` is missing, or `next build` fails while collecting route config for the API routes. Made it a lazy singleton instead.

### Still blocked — needs manual setup
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — empty, needs a Google Cloud Console OAuth web client ID.
- `NEXT_PUBLIC_ENOKI_API_KEY` — empty, needs the **public** key from the Enoki portal (portal.enoki.mystenlabs.com).
- `ENOKI_SECRET_KEY` — empty, needs the **private** key from the same portal (used server-side for sponsored transactions).
- Enoki portal: register `http://localhost:3400` (and the prod domain) as an allowed origin for the app, or the OAuth popup will be rejected.

### Verification performed
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; `/api/enoki/sponsor` and `/api/enoki/execute` register as dynamic routes.
- Did not test the live OAuth flow — blocked on the missing keys above.

---

## 2026-09-01 → 2026-09-02 — Diff review, P1/P2 plan, P1 execution, Docker infra

### Diff review vs `docs/Enoki_setup.md`
Compared the implementation above against the team's own Enoki playbook. Found real gaps:
- `docs/Enoki_setup.md` explicitly says **don't** build the manual backend `EnokiClient.createSponsoredTransaction`/`executeSponsoredTransaction` round trip for this project — sponsorship should be automatic via a Portal-level allowlist once the sender is an Enoki-wallet account. The `/api/enoki/sponsor` + `/api/enoki/execute` routes built on 2026-09-01 are exactly the flow it says to skip.
- Bare `<ConnectButton />` was used instead of the doc's required custom `<GoogleLogin />` (P2's target users have no crypto literacy — a generic "Connect Wallet" button is a stated non-starter).
- Missing `lib/signer.ts` (`useKonfirmIdentity()` hook) and a "confirm before this goes on-chain" UI — Enoki signs with no wallet confirmation popup, doc calls this out as the #1 gotcha.

### `docs/plan.md` added
Split the remaining Enoki work into P1 (Google Cloud Console, Enoki Portal, keys, sponsorship correctness — anything touching secrets/allowlists) and P2 (custom login UI, identity hook, confirm-before-sign UX — anything that only reads `useCurrentAccount`/`useSignAndExecuteTransaction`). Includes a shared 6-step acceptance checklist from the doc's 验收标准 section. Flagged that this 2-way split needs re-checking against PRD §8's assumption that 100% of on-chain work stays with one person.

### P1 tasks completed
1. Google Cloud Console OAuth web client created; `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set in `.env`.
2. Enoki Portal app `konfirm` — created **two** API keys (public and private are separate keys, not one key with two forms): public key scoped to testnet + zkLogin only (Sponsored Transactions is unavailable on public keys by design); private key scoped to testnet + zkLogin + Sponsored Transactions. Both saved to `.env` (`NEXT_PUBLIC_ENOKI_API_KEY`, `ENOKI_SECRET_KEY`).
3. Google registered as an Auth Provider in the Enoki Portal using the Client ID from task 1.
5. `.env` fully populated for all Enoki-related keys.
6. Removed `app/api/enoki/sponsor/`, `app/api/enoki/execute/`, `lib/enoki/server.ts`, `lib/enoki/sponsoredTransaction.ts` per the diff review finding above; uninstalled the now-unused `server-only` package. Rebuilt and typechecked clean after removal.

**Still blocked (P1 tasks 4, 7, 8, 9):** all gate on the Move package being deployed to Sui testnet — `NEXT_PUBLIC_PACKAGE_ID` / `NEXT_PUBLIC_REGISTRY_ID` are still `0x...` placeholders. Nothing to do here until that lands.

### Branch state discovery (not a regression — just unmerged work)
Mid-session the working tree was found on `dev`, not `feature/enoki-setup`. All the Enoki provider work (`app/providers.tsx`, wallet registration) lives only on `feature/enoki-setup` (latest commit `0312a33` "feat: finish phase 1 enoki sign up") and has not been merged into `dev`. `dev` currently has a teammate's `feature/frontend-pages` work merged in (login page, verify page, rebuttal card, i18n) which does **not** include the Enoki provider wiring — `app/layout.tsx` on `dev` has no `<Providers>` wrapper. These two branches need reconciling before P2's login UI work lands on top of a real, working provider setup.

### Docker / nginx / docker-compose / Makefile added (built on `dev`)
Per explicit request, added container infra:
- `Dockerfile` — multi-stage (`deps` → `builder` → `runner`), Next.js `output: 'standalone'`, runs as non-root `nextjs` user, all `NEXT_PUBLIC_*` vars passed as build `ARG`s (they're inlined into the client bundle at build time, so runtime env alone isn't enough)
- `nginx/Dockerfile` + `nginx/nginx.conf` — reverse proxy on port 80 → `nextjs:3400`, `client_max_body_size 15m` (for the base64 screenshot uploads in `/api/ocr`), websocket upgrade headers
- `docker-compose.yml` — `nextjs` is internal-only (`expose`, not `ports`); `nginx` is the only service bound to the host
- `Makefile` — `build` / `up` / `down` / `restart` / `logs` / `ps` / `sh` / `clean`
- `next.config.ts` — added `output: 'standalone'`
- `.dockerignore`, `public/.gitkeep` — `public/` didn't exist yet and Docker's `COPY` would fail on a missing source dir

**Flagged before building:** TRD §8 explicitly states "不做 Docker,不做 staging" (no Docker, no staging — Vercel-only hosting was the documented decision). Built anyway per direct instruction; doesn't remove the Vercel path, but the TRD may need a corresponding update if this is the new plan.

**Verification:** nginx image builds clean; `npm ci` in the `deps` stage installs clean; the Next.js build starts and compiles successfully, but the type-check step fails on two **pre-existing bugs already on `dev`**, unrelated to Docker (reproduced identically via plain `npm run build` on the host, outside any container):
1. `app/layout.tsx:29` — `Cannot find namespace 'JSX'`
2. Module-not-found on `@/messages/en.json` (next-intl import, pulled in from `app/login/page.tsx`, `app/page.tsx`, etc.)

Left unfixed — owned by whoever wrote `feature/frontend-pages`, out of scope for the infra task. `make up` will work once those are fixed upstream.

### Still blocked
- Move package deployment to Sui testnet (blocks P1 tasks 4, 7, 8, 9)
- `feature/enoki-setup` ↔ `dev` branch merge (blocks P2 from having a real provider setup to build against)
- The 2 build bugs above (blocks any Docker build — or any build at all — from going green on `dev`)

---

## 2026-09-02 — `docs/wallet.md`, `konfirm::registry` Move module, dapp-kit JSON-RPC dead end + bypass

### `docs/wallet.md` added
Full graph (mermaid) of the wallet layer end to end — Enoki/zkLogin flow for persona P1/P2 vs. the separate self-owned-wallet flow for persona P3's Challenge (FR-13). Clarified a naming collision: PRD personas P1/P2/P3 vs. `plan.md`'s team-split P1/P2 are unrelated. Found while diffing branches: `app/providers 2.tsx` on `feature/enoki-setup` is a stray leftover draft (the earlier, wrong registration pattern) that needs deleting before that branch merges. Also flagged: `app/login/page.tsx`'s Facebook/Apple buttons are dead ends — Apple isn't even a supported Enoki provider, and FR-11 only scopes Google. Also fixed in passing: `feature/wallet`'s `node_modules` was stale (`next-intl`/`react-icons` declared but never installed) — `npm install` fixed it, build went clean.

### `konfirm::registry` Move module generated (mentor's checklist item)
Per the mentor's framing — generate the module, human verifies against TRD §4 line by line — wrote `move/sources/registry.move` (renamed from the `konfirm::verdict` placeholder) + `move/tests/registry_tests.move`. Matched TRD §4.1 field-for-field: `lang` changed from `String` to `u8` enum, added the missing `models`/`request_ids: vector<String>` (required for FR-6, absent from the old scaffold), replaced the embedded `vector<Challenge>` with a separate shared `Challenge` object (each challenge needs its own object ID for P3 to link to). Removed from the old scaffold: `claim_text` (NFR-4 violation — raw claim text stored on-chain), `submitted_by` (not in TRD), `AttesterCap` (TRD specifies exactly two entry functions, no capability gate). Two design questions surfaced deliberately, not silently resolved: `create_verdict` has zero access control (matches TRD literally, but means any signed tx can fabricate a score), and the `STATE_*`/`NO_SCORE` constants aren't runtime-enforced by asserts, only used for documentation/tests.

**Verified:** `sui move build` — clean, zero warnings (after `#[allow(unused_const)]` on the module, since those constants are only referenced by `#[test_only]` accessors). `sui move test` — 2/2 passed (`create_verdict` sets expected fields, `challenge` increments `challenge_count` and leaves everything else untouched).

### Sui JSON-RPC is fully dead, industry-wide, as of 2026-07-31
While answering "what's the current gas fee" (answer: nothing is hardcoded anywhere in the repo), checked the network's live reference gas price and got `Method not found. JSON-RPC on public fullnodes has been deprecated.` from `fullnode.testnet.sui.io` — for *every* method tried (`getObject`, `getOwnedObjects`, `dryRunTransactionBlock`, `getChainIdentifier`), not just one. Confirmed via Sui's own docs + a web search: JSON-RPC shut down on testnet the week of 2026-07-06, mainnet 2026-07-20, full protocol-level deactivation 2026-07-31 — replaced entirely by gRPC and GraphQL. No provider, free or paid, still serves JSON-RPC.

**`@mysten/dapp-kit` has not caught up.** Pulled the actual 1.1.17 package (published 2026-08-17, over 2 weeks after the shutdown) — its own README still imports `getJsonRpcFullnodeUrl` from `@mysten/sui/jsonRpc`, changelog has zero mention of gRPC/transport migration. Its `SuiClientProvider` is hard-typed to only build a `SuiJsonRpcClient`, so every hook that pulls its client from that context (`useSuiClient`, `useCurrentAccount`'s balance reads, `useSignAndExecuteTransaction`) is non-functional against any live network today. `@mysten/enoki`'s `registerEnokiWallets`, by contrast, already accepts the newer `ClientWithCoreApi` type — Enoki itself was never the problem, only dapp-kit's client-provisioning layer.

### Bypassed dapp-kit's client layer (on `feature/wallet`)
Installed `@mysten/enoki @mysten/dapp-kit @mysten/sui @mysten/wallet-standard @tanstack/react-query` fresh (this branch had none of them). Empirically confirmed (not guessed) that the same public host still works fine over gRPC-web — `new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' }).core.getReferenceGasPrice()` returned `{ referenceGasPrice: '1000' }` live, and `getObject` on `0x2` also succeeded.

- `lib/sui/client.ts` — singleton `SuiGrpcClient`, the one real client used everywhere.
- `lib/sui/useSignAndExecuteTransaction.ts` — hand-rolled replacement for dapp-kit's broken hook of the same name. Reuses dapp-kit's `useCurrentWallet`/`useCurrentAccount` (pure wallet-standard state, unaffected by any of this) for the wallet-standard `signTransaction()` call, then builds via `transaction.toJSON({ client: suiClient })` and executes via `suiClient.core.executeTransaction(...)` — both accept the gRPC client directly, confirmed from `@mysten/sui`'s own type definitions.
- `app/providers.tsx` (recreated on `feature/wallet`, didn't exist here before) — `WalletProvider` + `EnokiWalletRegistration` (registers using the gRPC client) + a **dummy** `SuiClientProvider`.

**Why the dummy `SuiClientProvider` is still there:** traced a real build failure (`Could not find SuiClientContext`) to dapp-kit's `WalletProvider` unconditionally calling `useUnsafeBurnerWallet(enableUnsafeBurner)`, which calls `useSuiClient()` at the top of its body *before* checking whether the burner wallet is even enabled (confirmed by reading the hook's source directly). So `WalletProvider` cannot be used at all without some `SuiClientProvider` ancestor, regardless of whether that feature is used. The shim constructs a `SuiJsonRpcClient` object but it's never dialed — nothing in the app uses `ConnectButton`, `useSuiClient()`, or any dapp-kit hook that would call it; every real network call goes through `lib/sui/client.ts`.

**Verified:** `tsc --noEmit` clean, `npm run build` clean (`/` prerenders successfully — this is where the `SuiClientContext` bug first surfaced and got fixed), `npm run dev` serves `/` with HTTP 200 and no server errors. Did not get a live browser console check — the Chrome dev tool timed out and wasn't worth fighting for extra confidence given the build/runtime evidence already in hand.

### Still not done
- `<GoogleLogin />` UI, `/api/attest`, and the Move package deployment — this work unblocked the wallet *plumbing* (client + sign/execute hook), not the rest of `docs/wallet.md`'s missing-pieces list.
- `feature/wallet`'s provider setup should be treated as the new canonical version — it supersedes `feature/enoki-setup`'s (which still uses the dead JSON-RPC client) and should be what gets merged forward, not the other branch.

---

## 2026-09-02 — Repo restructure: `next/` + `move/`, root cleaned up

On `dev`. Repo root previously mixed the entire Next.js app (`app/`, `lib/`, `messages/`, `package.json`, configs) directly at top level alongside `move/` (the Sui package, already separated). Moved every Next.js-specific file into a new `next/` folder so the root only holds repo-wide things.

**Moved (git mv, tracked as renames):** `app/`, `lib/`, `messages/`, `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `oxlint.json`, `.prettierrc`, `vitest.config.ts`, `vitest.setup.ts`, `.env.example` → all under `next/`.

**Moved (plain mv, gitignored/untracked):** `node_modules`, `.next`, `.env`, `next-env.d.ts`, `tsconfig.build.tsbuildinfo`, `tsconfig.tsbuildinfo`, `AGENTS.md`, `CLAUDE.md`, `package-lock.json` → also under `next/`. `.gitignore`'s patterns aren't path-anchored, so they still match correctly at the new nesting depth — no changes needed there.

**Root now:** `.git`, `.gitignore`, `ARCHITECTURE.md`, `docs/`, `LICENSE`, `move/`, `next/`, `README.md`. Nothing else.

**Docs updated:** `README.md` (setup/run commands now say `cd next` first, added Move build/test commands) and `ARCHITECTURE.md`'s Context & Scope / Building Block View sections (folder tree now shows the `next/`/`move/` split). Did **not** retroactively edit path references inside `docs/history.md`, `docs/docker.md`, or `docs/wallet.md` — those are point-in-time records of what existed when they were written, not living docs; rewriting old paths into them would misrepresent when the restructure actually happened.

**Verified after the move:** `tsc --noEmit` clean from inside `next/`, `npm run build` clean from inside `next/` (all routes still prerender/register correctly), `sui move build` + `sui move test` still pass unchanged from inside `move/` (untouched by this, confirmed anyway). No import path changes were needed anywhere — the `@/*` tsconfig alias still resolves correctly since it's relative to wherever `tsconfig.json` lives, which moved along with everything it points at.

---

## 2026-09-02 — `redirect_uri_mismatch`, the placeholder `PACKAGE_ID`, and the discovery that Enoki sponsorship is not automatic

### `redirect_uri_mismatch` on the Google popup
Google was rejecting the login popup. Cause: the app sends `${window.location.origin}/login` (pinned in `next/app/providers.tsx`), `npm run dev` runs `next dev -p 3400 --experimental-https`, so the actual redirect URI is `https://localhost:3400/login` — while the Cloud Console had `http://localhost:3400` registered, per `docs/plan.md` P1 #1. Wrong scheme *and* missing path. Two entries added in the Console (`https://localhost:3400` as a JS origin, `https://localhost:3400/login` as a redirect URI). `docs/Enoki_setup.md` §1.3 corrected — it had `http://localhost:3000` with no path, which is wrong on all three counts (port, scheme, path).

### `ValiError: Invalid type: Expected Object but received Object`
Thrown from `toJSON()` inside `useSignAndExecuteTransaction`. The message is a valibot artifact, not a real type confusion: `SerializedTransactionDataV2Schema`'s `Command` is a `union` of `object()` schemas, and valibot's `_joinExpects` de-duplicates the options' `expects` strings — when every option expects `"Object"` and none match, the union reports `Expected Object but received Object`. Reproduced it locally in Node and read the sub-issues, which named the real failure: `commands.0.MoveCall.package` failing `isValidSuiAddress`.

**Root cause:** `next/.env` had `NEXT_PUBLIC_PACKAGE_ID=0x...` — a placeholder. The real package ID (`0x9c2a6684…42a7344`) only existed in the **repo-root** `.env`. Next.js loads `next/.env`, not the root one; the 2026-09-02 restructure moved the app's `.env` under `next/` but the root copy is the one that was later filled in. Copied the value across. `NEXT_PUBLIC_REGISTRY_ID` and `SUI_ATTESTER_SECRET` are still placeholders in `next/.env` but nothing in `app/` or `lib/` reads them.

### The 2026-09-01 diff review's central finding was wrong
The 2026-09-01→09-02 entry above records removing `app/api/enoki/sponsor`, `app/api/enoki/execute`, `lib/enoki/server.ts` and `lib/enoki/sponsoredTransaction.ts` on the grounds that `docs/Enoki_setup.md` §5 says sponsorship is automatic via the Portal allowlist. **That is not true of `@mysten/enoki` 1.2.19.** Read the shipped source rather than the doc:

- `dist/wallet/register.mjs` — `registerEnokiWallets` wraps the client in nothing; there is no sponsorship layer.
- `dist/wallet/wallet.mjs` — the wallet's feature set is `sui:signTransaction`, `sui:signAndExecuteTransaction`, `sui:signPersonalMessage`, plus Enoki's own metadata/session features. Both transaction paths call `parsedTransaction.build({ client })` against the **user's** address, which for a zkLogin account holds 0 SUI and therefore has no gas coin.
- `dist/EnokiClient/index.mjs` — the only sponsorship entry points in the whole SDK are `createSponsoredTransaction` (`POST transaction-blocks/sponsor`) and `executeSponsoredTransaction`.

Confirmed against `docs.enoki.mystenlabs.com/ts-sdk/sponsored-transactions`, which states sponsorship *"requires using private API keys"* and must run through a backend. So a server-side sponsor route is **mandatory**, not the anti-pattern the playbook called it. The deleted routes were the right idea; they were removed for a wrong reason and have been rebuilt.

### Sponsored transaction flow rebuilt
- `next/lib/enoki/sponsor.ts` — server-only `EnokiClient` (reads `ENOKI_SECRET_KEY` at call time, same lazy pattern as the original for the same build reason), plus `allowedMoveCallTargets()`.
- `next/app/api/sponsor/route.ts` — validates `sender` (32-byte hex) and `transactionKindBytes` (base64), rate-limited 3 req/min/IP like `/api/attest`, pins `allowedAddresses` to the one sender so a leaked response can't be replayed. Enoki's own rejection message is passed through verbatim on 502 — an allowlist miss otherwise presents as "the button does nothing".
- `next/app/api/sponsor/execute/route.ts` — submits the signature. Deliberately **not** rate-limited: the caller can only reach it with a digest `/api/sponsor` already issued and limited, and refusing at this point would strand a transaction whose gas is already reserved.
- `next/lib/sui/useSignAndExecuteTransaction.ts` — rewritten around the three-step flow (`build({ onlyTransactionKind: true })` → `/api/sponsor` → wallet signs → `/api/sponsor/execute` → `waitForTransaction` for effects). Call sites are unchanged. It asserts the bytes the wallet returns equal the bytes the sponsor issued: the wallet re-builds from the JSON it's handed, and a mismatch would otherwise surface as an opaque signature error from Enoki.

**Allowlist narrowed to one target.** `docs/Enoki_setup.md` §2.4 and `docs/plan.md` P1 #4 both list two, named `verdict::submit_verdict` / `verdict::add_challenge` — wrong module and wrong function names (the deployed module is `registry`, the entry is `create_verdict`), and wrong in count: PRD FR-13 says challenges go through an ordinary wallet, "不接 zkLogin、不接 sponsored tx". Allowlisting `registry::challenge` would pay gas the product explicitly says users pay themselves. Only `create_verdict` is allowlisted, in the code and in the corrected docs.

### `/api/health` added (P1 #9)
`GET /api/health` checks the Enoki private key (via `getApp()`, which also confirms the Google auth provider is registered), that `NEXT_PUBLIC_PACKAGE_ID` is well-formed and the package exists on-chain, and that `WALRUS_PUBLISHER` / `GONKA_ROUTER_API_KEY` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` are set. `503` if anything fails.

Two things TRD §9 asks for are **not obtainable** and the response says so rather than dropping them: there is no sponsor SUI balance to read (gas comes from Enoki's pool, not an address we own — TR-13's "sponsor 账户 testnet SUI 由 faucet 供给" no longer describes how this works), and Gonka exposes no balance endpoint. `GONKA_ROUTER_API_KEY` was also copied from the root `.env` into `next/.env`, where it was missing.

The `movePackage` check prints the exact allowlist string to paste into the Portal — that's the 5-second guard against the republish-without-re-allowlisting failure the playbook warns about.

### Verification performed
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; `/api/sponsor`, `/api/sponsor/execute`, `/api/health` all register as dynamic routes.
- `npx vitest run` — 8/8 pass, including 5 new tests for `/api/sponsor` (address validation, base64 validation, happy path, the 3-per-window rate limit, and the 502 pass-through of an Enoki rejection).
- **Live:** built and started a production server, `GET /api/health` returned `200` with every check green — so the Enoki private key is valid, scoped correctly, and the Google provider is registered in the Portal.
- **Live:** built a real `create_verdict` transaction kind against the deployed package and posted it to `/api/sponsor`; got `200` with sponsored bytes carrying a gas owner that is not the sender. That is direct evidence the Portal allowlist is already configured correctly — `docs/plan.md` P1 #4 is done, which was previously recorded as blocked.

### Docs corrected
- `docs/Enoki_setup.md` — §1.3 (redirect URIs), §2.4 (allowlist targets), Step 5 rewritten from "赞助自动生效" to the actual three-step flow with a note explaining why the original was wrong, and a new redeploy checklist appended.
- `docs/plan.md` — inline corrections on P1 #4/#6/#7 and a status table.

### Still not done
- Acceptance checklist items 3 and 5 — a user address showing 0 SUI, and a real transaction whose gas payer is not the user. These need one browser run and a look at the testnet explorer; nothing automated can stand in for them, and together they are the only actual proof sponsorship works end to end.
- `/api/verdict` is still returning mocked Gonka responses.
- `next/.env`'s `NEXT_PUBLIC_REGISTRY_ID` is still `0x...` (unused today).

---

## 2026-09-02 — Merge of `dev` frontend silently deleted the confirm-before-sign gate and broke the build

After pulling the newest frontend from `dev` (`3ac4741`, which brings in `2940c3d` "feat: wire real Google login, add /home route, fix mobile breakpoints"), checked whether the zkLogin/Enoki wiring survived. Every file did — `providers.tsx`, `GoogleLogin.tsx`, `AccountBadge.tsx`, `lib/signer.ts`, `lib/sui/client.ts`, `lib/sui/useSignAndExecuteTransaction.ts`, `lib/enoki/sponsor.ts`, `app/api/sponsor/*`, `app/api/health` — and `app/layout.tsx` still wraps everything in `<Providers>`. But the merge of `app/page.tsx` and `app/login/page.tsx` was resolved wrongly and **the app did not compile**: `tsc` failed with `app/page.tsx(139,7): ',' expected`.

### What the merge actually did

- **Duplicate imports.** `app/page.tsx` imported `GoogleLogin` twice (`./components/GoogleLogin` and `@/app/components/GoogleLogin`); `app/login/page.tsx` imported it twice as well, plus an `AccountBadge` it never renders.
- **`handleAttest` was half-overwritten.** The teammate's mock `handleAttestAfterLogin` (a 1.8s `setTimeout` that sets `demo-${Date.now()}` as the object ID, with a comment saying "`/api/attest` … doesn't exist yet") was spliced over the *head* of the real `handleAttest`, leaving its tail orphaned — a bare `setObjectId(verdict.objectId)` and a `} catch` with no `try`. That's the syntax error. The real Walrus + `create_verdict` + sponsored-signing path was gone.
- **The confirm-before-sign screen was deleted outright.** The whole `{needsConfirm && …}` JSX block vanished, and the login button was rewired to `onConnected={handleAttestAfterLogin}` — i.e. **signing in would immediately fire the on-chain write**. `needsConfirm`, `setNeedsConfirm` and the `confirmTitle`/`confirmBody`/`confirmButton`/`cancelButton` message keys all still existed; nothing referenced them any more. This is exactly the failure `docs/Enoki_setup.md` gotcha #1 exists to prevent: Enoki signs with no wallet confirmation popup, so that screen is the only moment a user agrees to publish.

### Repairs

- Removed the duplicate imports in both files, and the unused `AccountBadge` import in `app/login/page.tsx`.
- Restored the real `handleAttest` (from `ae53e9a`) and the `useEffect` that advances `needsLogin → needsConfirm` once `isSignedIn` flips, deleting the mock stub.
- Restored the `{needsConfirm && …}` block between the login gate and the attesting spinner.
- Changed the login button back to `<GoogleLogin label={…} />` with **no** `onConnected` — the effect above handles the transition, so logging in lands on the confirm screen instead of publishing.

### Kept from `dev`, not reverted

`GoogleLogin` was rewritten upstream from `{ labels: { signIn, unavailable }, className }` to `{ label, onConnected?, redirectTo? }`, where `redirectTo` lets a server component (`app/login/page.tsx`) use it without a callback. That's the better API and both call sites now use it, so it stayed; `app/page.spec.tsx` was updated to match, plus a `next/navigation` mock since the component now calls `useRouter()`. The new `/home` route is `export { default } from "@/app/page";`, so it inherits the whole wiring for free.

**Flagged, not changed:** the rewritten `GoogleLogin` hardcodes the English string `"Sign-in is temporarily unavailable."`. The previous version took it as a localised prop. For a three-locale Malaysian-market app that's a regression, but it belongs to whoever owns `feat/google-login`.

### Verification performed
- `npx tsc --noEmit` — clean (was failing before the repair).
- `npx vitest run` — 8/8 pass.
- `npm run build` — clean; `/home` registers as a static route alongside the existing ones, and `/api/sponsor`, `/api/sponsor/execute`, `/api/health` all still register.

### Lesson for the next merge
The build break was loud, but the deleted confirm gate was not — it would have shipped a silent "log in and it's instantly on-chain" flow that still typechecks and still passes every test in the repo. Nothing in CI covers it. When `feature/enoki-setup` and `dev` merge again, diff `app/page.tsx`'s gate states (`needsLogin` / `needsConfirm` / `isAttesting` / `attestError`) explicitly rather than trusting the merge.
