-- CreateTable
CREATE TABLE "ArtisanDiagnosis" (
    "id" TEXT NOT NULL,
    "artisanId" TEXT NOT NULL,
    "trade" TEXT NOT NULL DEFAULT 'PLUMBING',
    "note" TEXT,
    "photoKeys" TEXT[],
    "outcome" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "partsRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtisanDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtisanDiagnosis_artisanId_createdAt_idx" ON "ArtisanDiagnosis"("artisanId", "createdAt");

-- AddForeignKey
ALTER TABLE "ArtisanDiagnosis" ADD CONSTRAINT "ArtisanDiagnosis_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

