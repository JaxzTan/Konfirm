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
