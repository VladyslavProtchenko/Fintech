FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

COPY packages/shared-config  ./packages/shared-config
COPY packages/shared-logger  ./packages/shared-logger
COPY packages/shared-errors  ./packages/shared-errors
COPY packages/shared-prisma  ./packages/shared-prisma

COPY apps/payment-service ./apps/payment-service

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @fintech/shared-config build && \
    pnpm --filter @fintech/shared-logger build && \
    pnpm --filter @fintech/shared-errors build && \
    pnpm --filter @fintech/shared-prisma build

WORKDIR /app/apps/payment-service
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

COPY --from=builder /app/packages              ./packages
COPY --from=builder /app/apps/payment-service/dist      ./apps/payment-service/dist
COPY --from=builder /app/apps/payment-service/generated ./apps/payment-service/generated
COPY apps/payment-service/package.json                  ./apps/payment-service/package.json
COPY apps/payment-service/prisma                        ./apps/payment-service/prisma
COPY apps/payment-service/prisma.config.ts              ./apps/payment-service/prisma.config.ts

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/payment-service

EXPOSE 3004

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
