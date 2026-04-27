-- CreateTable
CREATE TABLE "MergedOcrResult" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "mergedText" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "mergeStrategy" TEXT NOT NULL,
    "selectedSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergedOcrResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MergedOcrResult_photoId_key" ON "MergedOcrResult"("photoId");

-- AddForeignKey
ALTER TABLE "MergedOcrResult" ADD CONSTRAINT "MergedOcrResult_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
