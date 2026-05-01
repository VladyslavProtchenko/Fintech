FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY packages/shared-auth ./packages/shared-auth
COPY packages/shared-config ./packages/shared-config
COPY packages/shared-health ./packages/shared-health
COPY packages/shared-prisma ./packages/shared-prisma
COPY platforms/cactus/api ./platforms/cactus/api

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/cactus/api
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/platforms/cactus/api/dist ./platforms/cactus/api/dist
COPY --from=builder /app/platforms/cactus/api/src/generated ./platforms/cactus/api/src/generated
COPY platforms/cactus/api/package.json ./platforms/cactus/api/package.json
COPY platforms/cactus/api/prisma ./platforms/cactus/api/prisma
COPY platforms/cactus/api/prisma.config.ts ./platforms/cactus/api/prisma.config.ts

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/cactus/api

EXPOSE 3014

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
