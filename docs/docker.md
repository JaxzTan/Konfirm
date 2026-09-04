# Docker / nginx setup (discarded — reference only)

**Status: not in the working tree.** This was built on 2026-09-02 on the `dev` branch, verified as far as it could be, then discarded per instruction (`docs/Konfirm_TRD.md` §8 states "不做 Docker,不做 staging" — no Docker, no staging, Vercel-only hosting was the documented decision). Kept here so it can be restored verbatim if the hosting decision changes.

## What it did

Two containers behind a reverse proxy: `nginx` (port 80, only thing bound to the host) → `nextjs` (internal-only, port 3400). `make up` builds and starts both.

## Verification result (before discarding)

- nginx image: builds clean
- `npm ci` in the `deps` stage: clean, 198 packages
- Next.js build: compiles successfully, but the type-check step failed on **two pre-existing bugs already on `dev`**, unrelated to Docker (reproduced identically via plain `npm run build` on the host, no container involved):
  1. `app/layout.tsx:29` — `Cannot find namespace 'JSX'`
  2. Module-not-found on `@/messages/en.json` (next-intl import, pulled in from `app/login/page.tsx`, `app/page.tsx`, etc.)
- Never reached a fully green `make up` — blocked on the above, which are owned by whoever wrote `feature/frontend-pages`.

## Files

### `next.config.ts` (diff against the tracked version)

```diff
 const nextConfig: NextConfig = {
+  output: 'standalone',
 };
```

Required for the Docker build — trims the production image down to only the files `node server.js` actually needs (`.next/standalone`).

### `Dockerfile`

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they
# must arrive as build args (from docker-compose.yml's build.args, sourced
# from .env) rather than as runtime environment. Add new NEXT_PUBLIC_* vars
# here AND in docker-compose.yml when they're introduced.
ARG NEXT_PUBLIC_SUI_NETWORK
ARG NEXT_PUBLIC_SUI_RPC
ARG NEXT_PUBLIC_PACKAGE_ID
ARG NEXT_PUBLIC_WALRUS_AGGREGATOR
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_FACEBOOK_CLIENT_ID
ARG NEXT_PUBLIC_ENOKI_API_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUI_NETWORK=$NEXT_PUBLIC_SUI_NETWORK \
  NEXT_PUBLIC_SUI_RPC=$NEXT_PUBLIC_SUI_RPC \
  NEXT_PUBLIC_PACKAGE_ID=$NEXT_PUBLIC_PACKAGE_ID \
  NEXT_PUBLIC_WALRUS_AGGREGATOR=$NEXT_PUBLIC_WALRUS_AGGREGATOR \
  NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
  NEXT_PUBLIC_FACEBOOK_CLIENT_ID=$NEXT_PUBLIC_FACEBOOK_CLIENT_ID \
  NEXT_PUBLIC_ENOKI_API_KEY=$NEXT_PUBLIC_ENOKI_API_KEY \
  NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3400
ENV PORT=3400
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
```

Notes:
- 3-stage build (`deps` → `builder` → `runner`) keeps `node_modules`/build tooling out of the final image.
- Runs as non-root `nextjs` user.
- Any new `NEXT_PUBLIC_*` env var added to the app needs a matching `ARG`/`ENV` line here **and** an entry in `docker-compose.yml`'s `build.args` — server-only secrets (`ENOKI_SECRET_KEY`, `SUI_ATTESTER_SECRET`, `DATABASE_URL`, etc.) do NOT go here, they're runtime-only via `env_file` in compose.

### `nginx/Dockerfile`

```dockerfile
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### `nginx/nginx.conf`

```nginx
upstream nextjs {
    server nextjs:3400;
}

server {
    listen 80;
    server_name _;

    # base64-encoded screenshots go through /api/ocr
    client_max_body_size 15m;

    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Next.js dev HMR / any websocket usage
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`client_max_body_size 15m` exists specifically for `/api/ocr`, which accepts base64-encoded screenshots in a JSON body.

### `docker-compose.yml`

```yaml
services:
  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUI_NETWORK: ${NEXT_PUBLIC_SUI_NETWORK}
        NEXT_PUBLIC_SUI_RPC: ${NEXT_PUBLIC_SUI_RPC}
        NEXT_PUBLIC_PACKAGE_ID: ${NEXT_PUBLIC_PACKAGE_ID}
        NEXT_PUBLIC_WALRUS_AGGREGATOR: ${NEXT_PUBLIC_WALRUS_AGGREGATOR}
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
        NEXT_PUBLIC_FACEBOOK_CLIENT_ID: ${NEXT_PUBLIC_FACEBOOK_CLIENT_ID}
        NEXT_PUBLIC_ENOKI_API_KEY: ${NEXT_PUBLIC_ENOKI_API_KEY}
        NEXT_PUBLIC_SITE_URL: ${NEXT_PUBLIC_SITE_URL}
    env_file:
      - .env
    restart: unless-stopped
    expose:
      - '3400'

  nginx:
    build:
      context: ./nginx
    restart: unless-stopped
    ports:
      - '80:80'
    depends_on:
      - nextjs
```

`nextjs` uses `expose` (internal-only, visible to other containers on the compose network) not `ports` — only `nginx` is reachable from the host. Compose auto-loads the project-root `.env` for the `${VAR}` substitutions in `build.args`.

### `Makefile`

```makefile
.PHONY: build up down restart logs ps sh clean

build: ## Build the nextjs + nginx images
	docker compose build

up: ## Build (if needed) and start the stack in the background
	docker compose up -d --build

down: ## Stop and remove the stack
	docker compose down

restart: down up ## Restart the stack

logs: ## Follow logs from all services
	docker compose logs -f

ps: ## Show running services
	docker compose ps

sh: ## Shell into the running nextjs container
	docker compose exec nextjs sh

clean: ## Stop the stack and remove volumes + dangling images
	docker compose down -v
	docker image prune -f
```

### `.dockerignore`

```
node_modules
.next
out
build
coverage
*.tsbuildinfo
.env
.env.local
.env.example
*.log
.DS_Store
.git
.gitignore
README.md
docs
AGENTS.md
CLAUDE.md
```

### `public/.gitkeep`

Empty placeholder. `public/` didn't exist in the repo at the time; the Dockerfile's `COPY --from=builder /app/public ./public` would fail on a missing source directory without it. If `public/` gains real content later, this file can be deleted.

## To restore

1. Re-create the 6 files above at their listed paths (`Dockerfile`, `nginx/Dockerfile`, `nginx/nginx.conf`, `docker-compose.yml`, `Makefile`, `.dockerignore`), plus `public/.gitkeep` if `public/` still doesn't exist.
2. Re-add `output: 'standalone'` to `next.config.ts`.
3. Fix the two `dev`-branch bugs blocking any build (JSX namespace in `app/layout.tsx`, `@/messages/en.json` resolution) — these aren't Docker-specific and will also block a plain `npm run build`.
4. `make up`.
