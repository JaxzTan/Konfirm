# Konfirm

<!-- TODO: confirm — one-line project description -->

NestJS backend service.

## Requirements

- Node.js v24+
- npm

## Setup

```bash
npm install
```

## Running it

```bash
npm run start:dev    # watch mode, http://localhost:3400
npm run start         # single run
npm run start:prod    # runs built dist/main (after npm run build)
```

## Configuration

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3400` | HTTP listen port |

## Common commands

| Command | Purpose |
|---|---|
| `npm run build` | Compile to `dist/` |
| `npm run lint` | oxlint on `src/`, `test/` |
| `npm run format` | Prettier write |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Coverage report |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for structure and design decisions.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Port already in use | Another process on 3400 | `PORT=3401 npm run start:dev` |
| Import errors on relative paths | NodeNext requires explicit `.js` extension in imports | Use `./foo.js` not `./foo` even for `.ts` files |
