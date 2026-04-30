FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY platforms/orange/api ./platforms/orange/api

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/orange/api
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/platforms/orange/api/dist ./platforms/orange/api/dist
COPY --from=builder /app/platforms/orange/api/src/generated ./platforms/orange/api/src/generated
COPY platforms/orange/api/package.json ./platforms/orange/api/package.json
COPY platforms/orange/api/prisma ./platforms/orange/api/prisma

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/platforms/orange/api

EXPOSE 3012

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
