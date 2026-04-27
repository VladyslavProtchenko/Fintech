-- CreateTable
CREATE TABLE "OcrResult" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OcrResult" ADD CONSTRAINT "OcrResult_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
