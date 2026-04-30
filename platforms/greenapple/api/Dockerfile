FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY apps/greenapple-api ./apps/greenapple-api

RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/greenapple-api
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/greenapple-api/dist ./apps/greenapple-api/dist
COPY --from=builder /app/apps/greenapple-api/generated ./apps/greenapple-api/generated
COPY apps/greenapple-api/package.json ./apps/greenapple-api/package.json
COPY apps/greenapple-api/prisma ./apps/greenapple-api/prisma

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/greenapple-api

EXPOSE 3010

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
