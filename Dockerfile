# Career Quest — один контейнер, одна команда запуска.
# Требует next.config.ts с output: "standalone" (добавляется при scaffold).

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Датасет нужен внутри образа, чтобы демо работало из чистого clone.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-demo.cjs ./scripts/start-demo.cjs
RUN mkdir -p /app/data/runtime && chown nextjs:nodejs /app/data/runtime && chmod 700 /app/data/runtime

USER nextjs
EXPOSE 3000
CMD ["node", "scripts/start-demo.cjs"]
