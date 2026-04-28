FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

# Workspace manifests and base TS config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Shared packages
COPY packages/shared-config   ./packages/shared-config
COPY packages/shared-logger   ./packages/shared-logger
COPY packages/shared-errors   ./packages/shared-errors
COPY packages/shared-prisma   ./packages/shared-prisma
COPY packages/shared-redis    ./packages/shared-redis
COPY packages/shared-queue    ./packages/shared-queue
COPY packages/shared-health   ./packages/shared-health

# Service source
COPY apps/otp-service ./apps/otp-service

RUN pnpm install --frozen-lockfile

# Build shared packages in dependency order
RUN pnpm --filter @fintech/shared-config build && \
    pnpm --filter @fintech/shared-logger build && \
    pnpm --filter @fintech/shared-errors build && \
    pnpm --filter @fintech/shared-prisma build && \
    pnpm --filter @fintech/shared-redis  build && \
    pnpm --filter @fintech/shared-queue  build && \
    pnpm --filter @fintech/shared-health build

WORKDIR /app/apps/otp-service
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy built shared packages
COPY --from=builder /app/packages ./packages

# Copy service artifacts
COPY --from=builder /app/apps/otp-service/dist         ./apps/otp-service/dist
COPY --from=builder /app/apps/otp-service/generated    ./apps/otp-service/generated
COPY apps/otp-service/package.json                     ./apps/otp-service/package.json
COPY apps/otp-service/prisma                           ./apps/otp-service/prisma

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/otp-service

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
