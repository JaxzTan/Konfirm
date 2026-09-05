# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps — install once, cached on package*.json alone so a source edit does not
# re-run npm ci.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they
# must arrive as build args (from docker-compose.yml's build.args, sourced
# from .env) rather than as runtime environment. Add new NEXT_PUBLIC_* vars
# here AND in docker-compose.yml when they're introduced.
#
# Server-only secrets (ENOKI_SECRET_KEY, SUI_ATTESTER_SECRET,
# GONKA_ROUTER_API_KEY, …) deliberately do NOT appear here — a build arg is
# readable in the image history. Those are runtime-only, via env_file.
ARG NEXT_PUBLIC_SUI_NETWORK
ARG NEXT_PUBLIC_SUI_RPC
ARG NEXT_PUBLIC_PACKAGE_ID
ARG NEXT_PUBLIC_REGISTRY_ID
ARG NEXT_PUBLIC_WALRUS_AGGREGATOR
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_FACEBOOK_CLIENT_ID
ARG NEXT_PUBLIC_ENOKI_API_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUI_NETWORK=$NEXT_PUBLIC_SUI_NETWORK \
    NEXT_PUBLIC_SUI_RPC=$NEXT_PUBLIC_SUI_RPC \
    NEXT_PUBLIC_PACKAGE_ID=$NEXT_PUBLIC_PACKAGE_ID \
    NEXT_PUBLIC_REGISTRY_ID=$NEXT_PUBLIC_REGISTRY_ID \
    NEXT_PUBLIC_WALRUS_AGGREGATOR=$NEXT_PUBLIC_WALRUS_AGGREGATOR \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_FACEBOOK_CLIENT_ID=$NEXT_PUBLIC_FACEBOOK_CLIENT_ID \
    NEXT_PUBLIC_ENOKI_API_KEY=$NEXT_PUBLIC_ENOKI_API_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN npm run build

# ---------------------------------------------------------------------------
# runner — only what `node server.js` needs.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# tesseract.js in full, on top of the trimmed copy standalone produces.
#
# The OCR worker is a child process that does `require('..')` from
# src/worker-script/node/index.js at runtime (line 15). Next's file tracer
# only follows static imports, so it never sees that and leaves
# src/worker-script/index.js out — the worker then dies with
# "Cannot find module '..'" and /api/ocr returns nothing at all.
# serverExternalPackages in next.config.ts stops it being bundled; it does
# not make the tracer copy the files.
# tesseract.js pulls these in from the worker at runtime too (node-fetch has
# its own transitive deps, hence the last three). Listed explicitly rather
# than copying all of node_modules, which would undo standalone entirely.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tesseract.js ./node_modules/tesseract.js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bmp-js ./node_modules/bmp-js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/idb-keyval ./node_modules/idb-keyval
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/is-url ./node_modules/is-url
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/node-fetch ./node_modules/node-fetch
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/regenerator-runtime ./node_modules/regenerator-runtime
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/wasm-feature-detect ./node_modules/wasm-feature-detect
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/zlibjs ./node_modules/zlibjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/whatwg-url ./node_modules/whatwg-url
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tr46 ./node_modules/tr46
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/webidl-conversions ./node_modules/webidl-conversions

USER nextjs

EXPOSE 3400
ENV PORT=3400
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
