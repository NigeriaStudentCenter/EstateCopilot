-- CreateEnum
CREATE TYPE "GenderPolicy" AS ENUM ('ANY', 'FEMALE_ONLY', 'MALE_ONLY');

-- CreateEnum
CREATE TYPE "StayPayer" AS ENUM ('GUEST', 'SPONSOR');

-- CreateEnum
CREATE TYPE "StayDepositStatus" AS ENUM ('NONE', 'HELD', 'PROPOSED', 'DISPUTED', 'AGREED', 'RETURNED');

-- CreateEnum
CREATE TYPE "StayReportKind" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "StayReportAuthor" AS ENUM ('HOST', 'GUEST');

-- CreateEnum
CREATE TYPE "StayIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
ALTER TYPE "ShortLetRateType" ADD VALUE 'SESSION';

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "distanceToCampusKm" DOUBLE PRECISION,
ADD COLUMN     "genderPolicy" "GenderPolicy" NOT NULL DEFAULT 'ANY',
ADD COLUMN     "houseRules" TEXT,
ADD COLUMN     "safetyFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "safetyInspectedAt" TIMESTAMP(3),
ADD COLUMN     "safetyInspectedBy" TEXT,
ADD COLUMN     "sessionRate" INTEGER;

-- AlterTable
ALTER TABLE "ShortLetBooking" ADD COLUMN     "agreementAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "depositAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositDeduction" INTEGER,
ADD COLUMN     "depositDeductionReason" TEXT,
ADD COLUMN     "depositDisputeNote" TEXT,
ADD COLUMN     "depositProposedAt" TIMESTAMP(3),
ADD COLUMN     "depositSettledAt" TIMESTAMP(3),
ADD COLUMN     "depositStatus" "StayDepositStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "manageToken" TEXT,
ADD COLUMN     "payer" "StayPayer" NOT NULL DEFAULT 'GUEST',
ADD COLUMN     "sponsorEmail" TEXT,
ADD COLUMN     "sponsorName" TEXT,
ADD COLUMN     "sponsorPhone" TEXT,
ADD COLUMN     "sponsorRelationship" TEXT;

-- CreateTable
CREATE TABLE "StayReport" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "StayReportKind" NOT NULL,
    "author" "StayReportAuthor" NOT NULL,
    "items" JSONB NOT NULL,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "responseComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StayReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StayIssue" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "StayIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "hostReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StayIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StayReview" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "safety" INTEGER NOT NULL,
    "host" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "comment" TEXT,
    "guestFirstName" TEXT NOT NULL,
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StayReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StayReview_bookingId_key" ON "StayReview"("bookingId");

-- CreateIndex
CREATE INDEX "StayReview_propertyId_idx" ON "StayReview"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLetBooking_manageToken_key" ON "ShortLetBooking"("manageToken");

-- AddForeignKey
ALTER TABLE "StayReport" ADD CONSTRAINT "StayReport_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ShortLetBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayIssue" ADD CONSTRAINT "StayIssue_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ShortLetBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayReview" ADD CONSTRAINT "StayReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ShortLetBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayReview" ADD CONSTRAINT "StayReview_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

