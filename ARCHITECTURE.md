# Architecture

Lightweight architecture doc (arc42-inspired, trimmed to project size). Update sections as the system grows.

## 1. Introduction & Goals

<!-- TODO: confirm — what is Konfirm for? one-line product goal -->

**Quality goals:** <!-- TODO: confirm — e.g. reliability, low latency, easy onboarding -->

## 2. Constraints

- Runtime: Node.js v24+ (developed on v24.12.0)
- Language: TypeScript (strict mode), ES2023 target, `bundler` module resolution (no `.js` extensions needed in relative imports)
- Framework: Next.js 16 (App Router) with React 19
- Package manager: npm

## 3. Context & Scope

Two independent parts, kept in separate top-level folders so the repo root stays clean:

- `next/` — the Next.js application, serving both UI and any API routes
- `move/` — the Sui Move package (`konfirm::registry`)

```
Browser ── HTTP :3400 ──> Konfirm (Next.js App Router, in next/)
```

<!-- TODO: confirm — any upstream/downstream services, databases, third-party APIs planned -->

## 4. Solution Strategy

- App Router with React Server Components by default; opt into the client with `'use client'` only where interactivity requires it.
- Backend work (if any) lives in Route Handlers (`app/api/*/route.ts`) or Server Actions rather than a separate service.
- Testing: Vitest + Testing Library, running under jsdom.
- Linting: oxlint. Formatting: Prettier.

## 5. Building Block View

Current structure:

```
next/
  app/
    layout.tsx        — root layout, <html>/<body> shell, metadata
    page.tsx          — route "/" (Server Component)
    page.spec.tsx     — smoke test for the home page
    globals.css       — global styles, light/dark tokens
    providers.tsx     — QueryClientProvider + WalletProvider + Enoki wallet registration
  lib/sui/             — gRPC Sui client + custom sign/execute hook (see docs/wallet.md)
  next.config.ts      — Next configuration
  vitest.config.ts    — test runner (jsdom + React plugin)
  vitest.setup.ts     — registers jest-dom matchers
  package.json        — scoped to the Next.js app only

move/
  sources/registry.move — konfirm::registry Move package (Verdict, Challenge)
  tests/                 — Move unit tests
```

One route today. As features are added, prefer one folder per route segment under `app/`, colocating components, tests and styles with the route that owns them.

## 6. Runtime View

**Request flow (current):**

```
GET / → app/layout.tsx → app/page.tsx → static HTML (prerendered)
```

Both routes (`/` and the built-in `/_not-found`) are statically prerendered at build time.

## 7. Deployment View

- Dev: `npm run dev` (Turbopack, port 3400)
- Prod build: `npm run build` (→ `.next/`), then `npm run start`

<!-- TODO: confirm — hosting target (Vercel, Docker, VM?), CI/CD pipeline -->

## 8. Cross-Cutting Concerns

- **Config:** no env schema yet; `.env.local` is gitignored. Remember that only `NEXT_PUBLIC_*` vars reach the browser. <!-- TODO: confirm — plan for env/config management as this grows -->
- **Error handling:** Next defaults. Add `app/error.tsx` / `app/not-found.tsx` when needed.
- **Validation:** none configured yet.
- **Auth:** none yet.
- **Styling:** plain CSS with custom properties in `app/globals.css`. <!-- TODO: confirm — Tailwind or a CSS-in-JS solution instead? -->

## 9. Architecture Decisions

| Decision | Rationale |
|---|---|
| Migrated from NestJS to Next.js | Project is a web app, not a standalone HTTP API; Next covers UI and API in one deployable |
| App Router over Pages Router | Server Components, streaming, and the actively developed path |
| Vitest over Jest | Faster, native ESM/TS support; carried over from the previous setup |
| oxlint over ESLint | Faster Rust-based linter; kept instead of `eslint-config-next` |
| Port 3400 (not Next's default 3000) | Preserves the port this project already documented |

## 10. Risks & Technical Debt

- No database/persistence layer yet.
- No config validation or env schema.
- No auth/authorization.
- Only a smoke-level test; no integration coverage.
- oxlint does not carry the Next-specific rules that `eslint-config-next` would (e.g. image/link usage hints).

## 11. Glossary

| Term | Meaning |
|---|---|
| RSC | React Server Component — renders on the server, ships no JS by default |
| App Router | Next's `app/` directory routing model |
| Route Handler | `app/api/*/route.ts` — HTTP endpoint inside the Next app |
