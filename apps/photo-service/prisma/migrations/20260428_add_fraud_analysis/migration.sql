-- Add FLAGGED status to PhotoStatus enum
ALTER TYPE "PhotoStatus" ADD VALUE 'FLAGGED';

-- Create FraudAnalysis table
CREATE TABLE "FraudAnalysis" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT NOT NULL,
    "flags" TEXT[],
    "metadataResult" JSONB,
    "elaResult" JSONB,
    "geminiResult" JSONB,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudAnalysis_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one FraudAnalysis per Photo
CREATE UNIQUE INDEX "FraudAnalysis_photoId_key" ON "FraudAnalysis"("photoId");

-- Foreign key to Photo
ALTER TABLE "FraudAnalysis" ADD CONSTRAINT "FraudAnalysis_photoId_fkey"
    FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
