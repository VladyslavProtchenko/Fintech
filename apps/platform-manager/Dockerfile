FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/platform-manager ./apps/platform-manager
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/platform-manager
RUN npx prisma generate
RUN pnpm build

FROM node:22-alpine AS production
RUN corepack enable
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /app/apps/platform-manager/dist ./apps/platform-manager/dist
COPY --from=builder /app/apps/platform-manager/src/generated ./apps/platform-manager/src/generated
COPY apps/platform-manager/package.json ./apps/platform-manager/package.json
COPY apps/platform-manager/prisma ./apps/platform-manager/prisma
COPY apps/platform-manager/prisma.config.ts ./apps/platform-manager/prisma.config.ts
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/platform-manager
EXPOSE 3020
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
