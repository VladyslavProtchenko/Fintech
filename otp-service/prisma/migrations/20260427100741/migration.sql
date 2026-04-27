-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'TIMEOUT', 'VERIFIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('SMS', 'WHATSAPP', 'VOICE');

-- CreateTable
CREATE TABLE "OtpAuditLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "carrier" TEXT,
    "channel" "Channel" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "OtpStatus" NOT NULL DEFAULT 'PENDING',
    "failoverChain" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "cost" DOUBLE PRECISION,
    "templateId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),

    CONSTRAINT "OtpAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderHealth" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "circuitState" TEXT NOT NULL DEFAULT 'closed',
    "circuitOpenedAt" TIMESTAMP(3),
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DlrCallback" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DlrCallback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpAuditLog_phoneHash_createdAt_idx" ON "OtpAuditLog"("phoneHash", "createdAt");

-- CreateIndex
CREATE INDEX "OtpAuditLog_provider_status_createdAt_idx" ON "OtpAuditLog"("provider", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OtpAuditLog_channel_status_createdAt_idx" ON "OtpAuditLog"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OtpAuditLog_ipAddress_createdAt_idx" ON "OtpAuditLog"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderHealth_circuitState_idx" ON "ProviderHealth"("circuitState");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderHealth_provider_country_channel_key" ON "ProviderHealth"("provider", "country", "channel");

-- CreateIndex
CREATE INDEX "DlrCallback_providerRef_idx" ON "DlrCallback"("providerRef");
