# Payment Service — Core Payment Engine

## Overview

Standalone NestJS microservice — payment system core.
USD only, minimal viable implementation.

- **Port**: 3004
- **Database**: `payment_service` (PostgreSQL, shared instance)
- **Path**: `apps/payment-service/`

## Database Schema

```prisma
model Client {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  wallet    Wallet?
  createdAt DateTime @default(now())
}

model Wallet {
  id        String        @id @default(uuid())
  clientId  String        @unique
  client    Client        @relation(fields: [clientId], references: [id])
  balance   Decimal       @db.Decimal(19,4)  // never FLOAT
  outgoing  Transaction[] @relation("FromWallet")
  incoming  Transaction[] @relation("ToWallet")
  createdAt DateTime      @default(now())
}

model Transaction {
  id             String      @id @default(uuid())
  fromWalletId   String?     // null = TOPUP (external deposit)
  toWalletId     String?     // null = WITHDRAWAL
  fromWallet     Wallet?     @relation("FromWallet", fields: [fromWalletId], references: [id])
  toWallet       Wallet?     @relation("ToWallet", fields: [toWalletId], references: [id])
  amount         Decimal     @db.Decimal(19,4)
  type           TxType      // TOPUP | TRANSFER | WITHDRAWAL
  status         TxStatus    // PENDING | COMPLETED | FAILED
  idempotencyKey String      @unique
  createdAt      DateTime    @default(now())
}

enum TxType   { TOPUP TRANSFER WITHDRAWAL }
enum TxStatus { PENDING COMPLETED FAILED }
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/clients` | Register client (creates wallet with 0 balance) |
| GET | `/clients/:id` | Get client info + balance |
| POST | `/transactions/topup` | Deposit funds |
| POST | `/transactions/transfer` | Transfer between clients |
| POST | `/transactions/withdraw` | Withdraw funds |
| GET | `/transactions?clientId=&type=&page=` | List transactions (paginated) |
| GET | `/health` | Health check |

## Implementation Steps

| # | Step | Details |
|---|------|---------|
| 1 | Scaffold | NestJS app, tsconfig, eslint, folder structure |
| 2 | Prisma schema | Models above, migration, init.sql update |
| 3 | Config / env | class-validator, PORT=3004 |
| 4 | ClientsModule | POST /clients, GET /clients/:id |
| 5 | WalletsModule | Auto-created on client register (balance=0) |
| 6 | TOPUP | Atomic: balance += amount |
| 7 | TRANSFER | Atomic: from -= X, to += X, insufficient funds check |
| 8 | WITHDRAWAL | Atomic: balance -= amount, insufficient funds check |
| 9 | TX history | GET /transactions with filters + pagination |
| 10 | Idempotency | Unique constraint on idempotencyKey, catch P2002 |
| 11 | Health | Standard /health endpoint |
| 12 | init.sql | Add CREATE DATABASE payment_service |
| 13 | docker-compose | Add payment-service to root compose |
| 14 | brand-service integration | brand-service calls payment-service instead of own TX table |

## Key Rules

- **DECIMAL(19,4)** for all money — never FLOAT
- **Atomic DB transactions** — transfer is all-or-nothing
- **Idempotency key** — client-supplied, prevents duplicate operations
- **Immutable transactions** — never delete/edit, only status changes
- **Insufficient funds** — throw 422 before attempting DB write

## Integration with Monorepo

```
docker-compose (root)
  ├── postgres       shared instance, new DB: payment_service
  ├── redis          shared
  ├── brand-service  :3002
  ├── brand-web      :3003
  └── payment-service :3004  ← new
```

## Environment Variables

```env
NODE_ENV=development
PORT=3004
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_service
```
