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

USER nextjs

EXPOSE 3400
ENV PORT=3400
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
