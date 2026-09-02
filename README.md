# Konfirm

<!-- TODO: confirm — one-line project description -->

Two independent parts, kept in separate top-level folders:

- `next/` — the Next.js web application
- `move/` — the Sui Move package (`konfirm::registry`)

## Requirements

- Node.js v24+, npm (for `next/`)
- the `sui` CLI (for `move/`)

## Setup

```bash
cd next
npm install
```

## Running it

All commands below run from inside `next/`:

```bash
npm run dev     # dev server (Turbopack, hot reload), http://localhost:3400
npm run build   # production build to .next/
npm run start   # serve the production build (after npm run build)
```

For the Move package, from inside `move/`:

```bash
sui move build
sui move test
```

## Configuration

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3400` | Set via the `-p` flag in the `dev`/`start` scripts |

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on port 3400 |
| `npm run build` | Production build |
| `npm run lint` | oxlint on `app/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier write |
| `npm run test` | Tests (Vitest + Testing Library) |
| `npm run test:cov` | Coverage report |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for structure and design decisions.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Port already in use | Another process on 3400 | Change the `-p` flag in the `dev` script, or `npx next dev -p 3401` |
| `next-env.d.ts` keeps reappearing | Next regenerates it on every build | Expected — it is gitignored |
| `AGENTS.md` / `CLAUDE.md` show as modified | `next dev` rewrites its own rules block | Commit the change, or set `agentRules: false` in `next.config.ts` |
