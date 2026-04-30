FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY apps/orange-api ./apps/orange-api
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@fintech/orange-api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/orange-api/dist ./dist
COPY --from=builder /app/apps/orange-api/prisma ./prisma
COPY --from=builder /app/apps/orange-api/prisma.config.ts ./
COPY --from=builder /app/apps/orange-api/package.json ./
COPY --from=builder /app/apps/orange-api/node_modules ./node_modules
COPY --from=builder /app/apps/orange-api/src/generated ./generated
EXPOSE 3012
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
