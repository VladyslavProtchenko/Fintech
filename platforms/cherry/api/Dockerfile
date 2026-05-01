FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY packages/shared-auth ./packages/shared-auth
COPY packages/shared-config ./packages/shared-config
COPY packages/shared-health ./packages/shared-health
COPY packages/shared-prisma ./packages/shared-prisma
COPY platforms/cherry/api ./platforms/cherry/api

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/cherry/api
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/platforms/cherry/api/dist ./platforms/cherry/api/dist
COPY --from=builder /app/platforms/cherry/api/src/generated ./platforms/cherry/api/src/generated
COPY platforms/cherry/api/package.json ./platforms/cherry/api/package.json
COPY platforms/cherry/api/prisma ./platforms/cherry/api/prisma
COPY platforms/cherry/api/prisma.config.ts ./platforms/cherry/api/prisma.config.ts

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/cherry/api

EXPOSE 3018

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
