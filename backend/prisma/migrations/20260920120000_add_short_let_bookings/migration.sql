-- CreateEnum
CREATE TYPE "ShortLetRateType" AS ENUM ('NIGHTLY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ShortLetBookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "nightlyRate" INTEGER,
ADD COLUMN     "weeklyRate" INTEGER;

-- CreateTable
CREATE TABLE "ShortLetBooking" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "rateType" "ShortLetRateType" NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" "ShortLetBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentRef" TEXT,
    "paymentLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLetBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortLetBooking_paymentRef_key" ON "ShortLetBooking"("paymentRef");

-- AddForeignKey
ALTER TABLE "ShortLetBooking" ADD CONSTRAINT "ShortLetBooking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

