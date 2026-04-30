-- CreateEnum
CREATE TYPE "PlatformStatus" AS ENUM ('CREATING', 'BUILDING', 'RUNNING', 'STOPPED', 'FAILED');

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "PlatformStatus" NOT NULL DEFAULT 'CREATING',
    "siteUrl" TEXT,
    "swaggerUrl" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Platform_slug_key" ON "Platform"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_domain_key" ON "Platform"("domain");
