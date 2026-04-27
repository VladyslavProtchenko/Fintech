# Fintech Platform

Microservices platform built with NestJS, TypeScript, PostgreSQL, and Redis.

## Services

| Service | Description | Port | Docs |
|---|---|---|---|
| [otp-service](./otp-service) | Multi-provider OTP delivery — SMS, WhatsApp, Voice | 3001 | [Architecture](./otp-service/docs/architecture.md) |
| [photo-service](./photo-service) | Self-hosted OCR receipt recognition | 3000 | [Architecture](./photo-service/docs/architecture.md) |

## Stack

- **Runtime** — Node.js 20+, TypeScript strict
- **Framework** — NestJS 11
- **Database** — PostgreSQL 17 + Prisma 7
- **Cache / Queue** — Redis 7 + ioredis
- **Validation** — class-validator + class-transformer

## Quick Start

Each service runs independently. See the service README for setup instructions.

```bash
# OTP Service
cd otp-service
cp .env.example .env        # fill in your keys
docker compose up -d        # PostgreSQL + Redis
npm install
npm run prisma:migrate
npm run prisma:generate
npm run start:dev

# Photo Service
cd photo-service
# see photo-service README
```

## Architecture

- [OTP Service — Architecture](./otp-service/docs/architecture.md)
- [Photo Service — Architecture](./photo-service/docs/architecture.md)
- [OTP Service — Design](./docs/DESIGN.md)
