FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY packages/shared-auth ./packages/shared-auth
COPY packages/shared-config ./packages/shared-config
COPY packages/shared-health ./packages/shared-health
COPY packages/shared-prisma ./packages/shared-prisma
COPY platforms/apricot/api ./platforms/apricot/api

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/apricot/api
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/platforms/apricot/api/dist ./platforms/apricot/api/dist
COPY --from=builder /app/platforms/apricot/api/src/generated ./platforms/apricot/api/src/generated
COPY platforms/apricot/api/package.json ./platforms/apricot/api/package.json
COPY platforms/apricot/api/prisma ./platforms/apricot/api/prisma
COPY platforms/apricot/api/prisma.config.ts ./platforms/apricot/api/prisma.config.ts

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/apricot/api

EXPOSE 3016

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
