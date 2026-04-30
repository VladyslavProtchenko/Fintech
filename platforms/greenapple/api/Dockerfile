FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY platforms/greenapple/api ./platforms/greenapple/api

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/greenapple/api
RUN npx prisma generate
RUN pnpm build


FROM node:22-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/platforms/greenapple/api/dist ./platforms/greenapple/api/dist
COPY --from=builder /app/platforms/greenapple/api/src/generated ./platforms/greenapple/api/src/generated
COPY platforms/greenapple/api/package.json ./platforms/greenapple/api/package.json
COPY platforms/greenapple/api/prisma ./platforms/greenapple/api/prisma

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/platforms/greenapple/api

EXPOSE 3010

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
