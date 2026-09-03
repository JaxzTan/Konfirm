# Redeploy checklist — run this every time the Move package is republished

**Why this exists.** Republishing a Move package does not update it in place —
Sui gives you a **brand-new `PACKAGE_ID`**. Enoki matches sponsored Move call
targets as **exact strings**, so until every place that names the old package
is updated, **sponsored transactions stop being sponsored**.

The failure is silent and late: login still works, `/api/attest` still returns
200, the confirm dialog still appears — and then `/api/sponsor` returns 502
with "target not allowed" at the exact moment you are demoing. Nothing earlier
in the flow warns you.

> **Good news: there is no Enoki Portal step.** The sponsorship allowlist is
> **not** Portal configuration — the Enoki app config has no such field (it
> holds only `allowedOrigins`, `authenticationProviders`, `domains`).
> `allowedMoveCallTargets` is a per-request argument to
> `createSponsoredTransaction`, supplied by `allowedMoveCallTargets()` in
> `lib/enoki/sponsor.ts` and derived from `NEXT_PUBLIC_PACKAGE_ID`. So the
> allowlist **cannot drift** from the deployed package — update the env var and
> rebuild, and it follows automatically. That makes this checklist short.

Run every step, in order.

---

## 1. Republish

Only the **UpgradeCap holder** can do this. Today that is
`0x6ef0900b12a0e96bc2b7052c02bafc90c773cdc03bb1acb8b1355b7232fdca39` — not
necessarily the person reading this. Confirm who holds it before planning a
republish.

```bash
cd move
sui move test                    # never republish a package whose tests fail
sui client publish
```

If it refuses with *"Your package is already published"*, that is the
`Published.toml` guard doing its job. Remove the `[published.testnet]` entry
only if you genuinely intend a fresh publish.

## 2. Get the new PACKAGE_ID

```bash
grep 'published-at' move/Published.toml
```

Confirm the on-chain bytecode matches your source before trusting it:

```bash
cd move && sui client verify-source
```

## 3. Update the env var

```bash
# next/.env
NEXT_PUBLIC_PACKAGE_ID=<new id>
```

Update it **everywhere it exists** — local `next/.env` *and* the deployment
environment (Vercel project settings). A local-only change means the deployed
demo keeps using the dead package ID.

## 4. The allowlist — nothing to do

Skip this. It updates itself: `allowedMoveCallTargets()` builds
`<PACKAGE_ID>::registry::create_verdict` from the env var you just changed, so
step 3 already did it.

The only reason to open `lib/enoki/sponsor.ts` is if you add a **new sponsored
entry function** to the contract. If you do, note what is deliberately absent:
`registry::challenge` is **not** allowlisted, and must not be. PRD FR-13 says
challenges are signed by the user's own wallet and self-paid
("不接 zkLogin、不接 sponsored tx"). Sponsoring it would pay for transactions
the product says users pay for themselves, and widen the gas-drain surface
that the `/api/attest` rate limit exists to close.

## 5. Rebuild — this step is easy to forget

`NEXT_PUBLIC_*` variables are **inlined into the JavaScript bundle at build
time**, not read at runtime. Editing `.env` does nothing to an already-running
server or an already-built deployment.

```bash
# local: restart the dev server (Ctrl+C, then)
npm run dev

# deployed: trigger a fresh build, not just a restart
```

## 6. Verify before you trust it

```bash
curl -sk https://localhost:3400/api/health | python3 -m json.tool
```

Every check must be `ok: true`. The `movePackage` check prints the exact
target the sponsor will accept and confirms that package exists on-chain. If it
still shows the **old** package ID, the rebuild in step 5 didn't happen —
that's the failure this checklist exists to catch.

## 7. Smoke-test the real path

A green `/api/health` proves configuration, not sponsorship. Only a real
transaction proves sponsorship:

1. Sign in with Google
2. Run a claim through to **Attest & share**
3. Confirm a Verdict object is created and you get a digest

Then check the two things that actually prove sponsorship worked:

| Check | Expected |
|---|---|
| The signed-in user's SUI balance | **0 SUI** |
| Gas payer on the transaction | **Not** the user's address |

If the user paid their own gas, sponsorship is silently off — the transaction
still succeeds, so this is the only way to catch it.

---

## What does *not* need changing

- **Existing Verdict objects.** Objects created by the old package keep working
  and stay readable at `/v/[objectId]`. You are not migrating data.
- **`NEXT_PUBLIC_REGISTRY_ID`.** Gone as of 2026-09-03. It was vestigial —
  `registry.move` has no `init()` and no `Registry` struct, so nothing ever
  filled it and nothing read it. Removed from `.env`, `.env.example` and the
  Docker build args so it stops reading as an unfinished setup step.
- **Google Cloud Console / auth providers.** Unrelated to the package ID.
- **The Enoki app itself.** Never delete and recreate it — the zkLogin salt is
  per-app, so a new app gives every returning user a different address and
  breaks FR-11 identity stability.
