# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY packages/server/package.json packages/server/
COPY packages/provisioning/package.json packages/provisioning/
COPY packages/ui/package.json packages/ui/
COPY apps/app/package.json apps/app/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/app/node_modules ./apps/app/node_modules
COPY . .
RUN pnpm --filter @kitsuneos/core build \
 && pnpm --filter @kitsuneos/mcp build \
 && pnpm --filter @kitsuneos/server build \
 && pnpm --filter @kitsuneos/provisioning build \
 && pnpm --filter @kitsuneos/ui build \
 && pnpm --filter @kitsuneos/app build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/app/public ./apps/app/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/static ./apps/app/.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "apps/app/server.js"]
