-- Artisan Network — Phase 1: accounts, classification, work photos, verification.

CREATE TYPE "Trade" AS ENUM (
  'BRICKLAYER','ROOFER','POP_CEILING','TILER','ALUMINIUM_GLAZING','WELDER_FABRICATOR',
  'BOREHOLE_WATER','DRAINAGE_SOAKAWAY','PAINTER','ELECTRICIAN','PLUMBER','AC_TECHNICIAN',
  'GENERATOR_TECHNICIAN','SOLAR_INVERTER','CARPENTER_FURNITURE','APPLIANCE_REPAIR','LOCKSMITH',
  'DSTV_CCTV','FUMIGATION_PEST','CLEANING_POST_CONSTRUCTION','GARDENER_LANDSCAPING',
  'INTERLOCKING_PAVING','UPHOLSTERY'
);
CREATE TYPE "ArtisanSkillLevel" AS ENUM ('HAND','TRADESMAN','MASTER');
CREATE TYPE "ArtisanAvailability" AS ENUM ('OPEN','BUSY','AWAY');
CREATE TYPE "ArtisanCredentialKind" AS ENUM ('NIN','BVN','REFERENCE','SITE_VISIT');
CREATE TYPE "ArtisanCredentialStatus" AS ENUM ('PENDING','VERIFIED','FAILED');

CREATE TABLE "Artisan" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "businessName" TEXT,
  "bio" TEXT,
  "photoUrl" TEXT,
  "baseState" TEXT NOT NULL,
  "baseLga" TEXT NOT NULL,
  "coverageLgas" TEXT[],
  "skillLevel" "ArtisanSkillLevel" NOT NULL DEFAULT 'TRADESMAN',
  "availability" "ArtisanAvailability" NOT NULL DEFAULT 'OPEN',
  "verificationTier" INTEGER NOT NULL DEFAULT 0,
  "isListed" BOOLEAN NOT NULL DEFAULT false,
  "score" INTEGER NOT NULL DEFAULT 0,
  "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ratingCount" INTEGER NOT NULL DEFAULT 0,
  "jobsCompleted" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Artisan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Artisan_phone_key" ON "Artisan"("phone");

CREATE TABLE "ArtisanTrade" (
  "id" TEXT NOT NULL,
  "artisanId" TEXT NOT NULL,
  "trade" "Trade" NOT NULL,
  "yearsExperience" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ArtisanTrade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArtisanTrade_artisanId_trade_key" ON "ArtisanTrade"("artisanId","trade");
ALTER TABLE "ArtisanTrade" ADD CONSTRAINT "ArtisanTrade_artisanId_fkey"
  FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArtisanCredential" (
  "id" TEXT NOT NULL,
  "artisanId" TEXT NOT NULL,
  "kind" "ArtisanCredentialKind" NOT NULL,
  "status" "ArtisanCredentialStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedName" TEXT,
  "evidenceUrl" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtisanCredential_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ArtisanCredential" ADD CONSTRAINT "ArtisanCredential_artisanId_fkey"
  FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkSample" (
  "id" TEXT NOT NULL,
  "artisanId" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "caption" TEXT,
  "trade" "Trade",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkSample_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WorkSample" ADD CONSTRAINT "WorkSample_artisanId_fkey"
  FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairQuote" ADD COLUMN "artisanId" TEXT;
ALTER TABLE "RepairQuote" ADD CONSTRAINT "RepairQuote_artisanId_fkey"
  FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
