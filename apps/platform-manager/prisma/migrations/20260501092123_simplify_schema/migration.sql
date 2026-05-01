/*
  Warnings:

  - You are about to drop the column `apiPort` on the `Platform` table. All the data in the column will be lost.
  - You are about to drop the column `prompt` on the `Platform` table. All the data in the column will be lost.
  - You are about to drop the column `webPort` on the `Platform` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Platform_apiPort_key";

-- DropIndex
DROP INDEX "Platform_webPort_key";

-- AlterTable
ALTER TABLE "Platform" DROP COLUMN "apiPort",
DROP COLUMN "prompt",
DROP COLUMN "webPort";
