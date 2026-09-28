-- CreateEnum
CREATE TYPE "StayUnitType" AS ENUM ('ENTIRE_PLACE', 'PRIVATE_ROOM', 'SHARED_ROOM');

-- CreateEnum
CREATE TYPE "StayPurpose" AS ENUM ('DAILY', 'STUDENT');

-- CreateEnum
CREATE TYPE "GuestIdCheck" AS ENUM ('VERIFIED', 'NOT_CHECKED');

-- AlterEnum
ALTER TYPE "ShortLetBookingStatus" ADD VALUE 'AWAITING_APPROVAL';

-- AlterEnum
ALTER TYPE "ShortLetRateType" ADD VALUE 'MONTHLY';

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "maxGuests" INTEGER,
ADD COLUMN     "monthlyRate" INTEGER,
ADD COLUMN     "nearUniversity" TEXT,
ADD COLUMN     "stayUnitType" "StayUnitType",
ADD COLUMN     "studentFriendly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ShortLetBooking" ADD COLUMN     "hostNote" TEXT,
ADD COLUMN     "idCheck" "GuestIdCheck" NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN     "idLast4" TEXT,
ADD COLUMN     "idType" TEXT,
ADD COLUMN     "idVerifiedName" TEXT,
ADD COLUMN     "purpose" "StayPurpose" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "studentIdKey" TEXT,
ADD COLUMN     "studentInstitution" TEXT;

