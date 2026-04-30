-- AlterTable: add platformId column (non-nullable, default 'legacy' for existing rows)
ALTER TABLE "Client" ADD COLUMN "platformId" TEXT NOT NULL DEFAULT 'legacy';

-- Remove default after backfill
ALTER TABLE "Client" ALTER COLUMN "platformId" DROP DEFAULT;

-- DropIndex: old unique on email only
DROP INDEX "Client_email_key";

-- CreateIndex: new composite unique on email + platformId
CREATE UNIQUE INDEX "Client_email_platformId_key" ON "Client"("email", "platformId");
