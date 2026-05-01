-- Add displayName (default empty string for any existing rows)
ALTER TABLE "Platform" ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '';

-- Remove default after column creation (Prisma manages defaults via app, not DB)
ALTER TABLE "Platform" ALTER COLUMN "displayName" DROP DEFAULT;

-- Add nullable port columns
ALTER TABLE "Platform" ADD COLUMN "apiPort" INTEGER;
ALTER TABLE "Platform" ADD COLUMN "webPort" INTEGER;

-- Drop swaggerUrl (removed from schema)
ALTER TABLE "Platform" DROP COLUMN IF EXISTS "swaggerUrl";

-- Unique indexes for ports
CREATE UNIQUE INDEX "Platform_apiPort_key" ON "Platform"("apiPort");
CREATE UNIQUE INDEX "Platform_webPort_key" ON "Platform"("webPort");
