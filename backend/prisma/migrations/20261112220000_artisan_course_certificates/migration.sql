-- CreateTable
CREATE TABLE "ArtisanCertificate" (
    "id" TEXT NOT NULL,
    "artisanId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "nameMatched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtisanCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtisanCertificate_certificateId_key" ON "ArtisanCertificate"("certificateId");

-- CreateIndex
CREATE INDEX "ArtisanCertificate_artisanId_idx" ON "ArtisanCertificate"("artisanId");

-- AddForeignKey
ALTER TABLE "ArtisanCertificate" ADD CONSTRAINT "ArtisanCertificate_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

