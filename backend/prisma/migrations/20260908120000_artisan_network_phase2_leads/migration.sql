-- Artisan Network — Phase 2: the public directory.
-- Only new object is ArtisanLead — a direct "request a quote" from the
-- directory that lands in the artisan's portal. Scoring & filtering reuse
-- existing columns.

CREATE TYPE "ArtisanLeadStatus" AS ENUM ('NEW','CONTACTED','CLOSED');

CREATE TABLE "ArtisanLead" (
  "id" TEXT NOT NULL,
  "artisanId" TEXT NOT NULL,
  "requesterName" TEXT NOT NULL,
  "requesterPhone" TEXT NOT NULL,
  "requesterRole" TEXT,
  "lga" TEXT,
  "trade" "Trade",
  "message" TEXT NOT NULL,
  "status" "ArtisanLeadStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtisanLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArtisanLead_artisanId_idx" ON "ArtisanLead"("artisanId");

ALTER TABLE "ArtisanLead"
  ADD CONSTRAINT "ArtisanLead_artisanId_fkey"
  FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
