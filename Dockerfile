# syntax=docker/dockerfile:1

# One image per app: docker build --build-arg APP=factory (default) or APP=client.
ARG APP=factory

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
# Monorepo: install from the root so the workspace packages get linked.
COPY package.json package-lock.json ./
COPY apps/factory/package.json apps/factory/
COPY apps/client/package.json apps/client/
COPY packages/lib/package.json packages/lib/
COPY packages/ui/package.json packages/ui/
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
# Root and any per-workspace node_modules.
COPY --from=deps /app ./
COPY . .

# NEXT_PUBLIC_* vars are inlined at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_CLIENT_ORIGIN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_CLIENT_ORIGIN=$NEXT_PUBLIC_CLIENT_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1

ARG APP
RUN npm run build -w @repo/${APP}

# ---- runner ----
FROM node:22-alpine AS runner
ARG APP
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# The standalone build is traced from the repo root (next.config.ts), so the
# app's server.js sits at apps/<app>/ inside it.
COPY --from=build /app/apps/${APP}/public ./apps/${APP}/public
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENV APP=${APP}
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
