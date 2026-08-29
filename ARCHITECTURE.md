# Architecture

Lightweight architecture doc (arc42-inspired, trimmed to project size). Update sections as the system grows.

## 1. Introduction & Goals

<!-- TODO: confirm — what is Konfirm for? one-line product goal -->

**Quality goals:** <!-- TODO: confirm — e.g. reliability, low latency, easy onboarding -->

## 2. Constraints

- Runtime: Node.js v24+ (developed on v24.12.0)
- Language: TypeScript (strict mode), ES2023 target, NodeNext modules (`.js` extensions required in relative imports, e.g. `./app.module.js`)
- Framework: NestJS 12 (`@nestjs/core`, `@nestjs/platform-express`)
- Package manager: npm

## 3. Context & Scope

Single HTTP service. No external systems integrated yet.

```
Client ── HTTP :3400 ──> Konfirm (NestJS/Express)
```

<!-- TODO: confirm — any upstream/downstream services, databases, third-party APIs planned -->

## 4. Solution Strategy

- Standard NestJS layered structure: Controller → Service → (future) Repository/Module.
- Dependency injection via Nest's `@Module`/`@Injectable` decorators — no manual wiring.
- Testing: Vitest (unit) + Supertest (e2e), replacing Nest's default Jest setup.
- Linting: oxlint. Formatting: Prettier.

## 5. Building Block View

Current structure:

```
src/
  main.ts              — app bootstrap, HTTP listener (port 3400)
  app.module.ts         — root module, wires controllers/providers
  app.controller.ts     — HTTP layer, routes -> service calls
  app.service.ts        — business logic (currently: getHello())
  app.controller.spec.ts — unit test for controller

test/
  app.e2e-spec.ts       — end-to-end HTTP test against bootstrapped app
```

One module today (`AppModule`). As features are added, prefer one feature module per domain concern (e.g. `UsersModule`, `AuthModule`) rather than growing `AppModule`.

## 6. Runtime View

**Request flow (current):**

```
GET / → AppController.getHello() → AppService.getHello() → "Hello World!"
```

## 7. Deployment View

- Dev: `npm run start:dev` (watch mode, port 3400 or `$PORT`)
- Prod build: `npm run build` (nest build → `dist/`), then `npm run start:prod` (`node dist/main`)
- `npm run deploy` — uses `@nestjs/mau` <!-- TODO: confirm — mau deployment target/config not yet set up -->

<!-- TODO: confirm — hosting target (mau, Docker, VM, serverless?), CI/CD pipeline -->

## 8. Cross-Cutting Concerns

- **Config:** `process.env.PORT` read directly in `main.ts`; no `@nestjs/config` module yet. <!-- TODO: confirm — plan for env/config management as this grows -->
- **Error handling:** Nest defaults (no custom filters/pipes yet).
- **Validation:** none configured yet (no `class-validator`/`ValidationPipe`).
- **Auth:** none yet.

## 9. Architecture Decisions

| Decision | Rationale |
|---|---|
| Vitest over Jest | Faster, native ESM/TS support, replaced Nest's default Jest scaffold |
| oxlint over ESLint | Faster Rust-based linter |
| NodeNext module resolution | Required for native ESM output under Node 24 |

## 10. Risks & Technical Debt

- No database/persistence layer yet.
- No config validation or env schema.
- No auth/authorization.
- Single module — will need restructuring into feature modules once real domain logic lands.

## 11. Glossary

| Term | Meaning |
|---|---|
| Nest | NestJS framework |
| DI | Dependency Injection (Nest's core pattern via decorators) |
