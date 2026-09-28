-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgentDealStatus" AS ENUM ('PENDING_LANDLORD', 'AWAITING_PAYMENT', 'PAID', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ArtisanPaymentStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'CANCELLED');


-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "agencyName" TEXT,
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "licenceNumber" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "paystackSubaccountCode" TEXT,
ADD COLUMN     "states" TEXT[],
ADD COLUMN     "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Artisan" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "paystackSubaccountCode" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "agentId" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "agentFeePercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "agentsAllowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AgentDeal" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bookingId" TEXT,
    "tenantName" TEXT NOT NULL,
    "tenantEmail" TEXT NOT NULL,
    "tenantPhone" TEXT NOT NULL,
    "annualRent" INTEGER NOT NULL,
    "agentFee" INTEGER NOT NULL,
    "platformPercent" INTEGER NOT NULL,
    "platformAmount" INTEGER NOT NULL,
    "agentAmount" INTEGER NOT NULL,
    "status" "AgentDealStatus" NOT NULL DEFAULT 'PENDING_LANDLORD',
    "landlordToken" TEXT NOT NULL,
    "landlordRespondedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "paymentRef" TEXT,
    "paymentLink" TEXT,
    "payoutMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAlert" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "propertyId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoSnapshot" (
    "landlordId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoSnapshot_pkey" PRIMARY KEY ("landlordId")
);

-- CreateTable
CREATE TABLE "ArtisanJobPayment" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "artisanId" TEXT,
    "payerEmail" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "platformPercent" INTEGER NOT NULL,
    "platformAmount" INTEGER NOT NULL,
    "artisanAmount" INTEGER NOT NULL,
    "status" "ArtisanPaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "paymentRef" TEXT NOT NULL,
    "paymentLink" TEXT,
    "payoutMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtisanJobPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDeal_landlordToken_key" ON "AgentDeal"("landlordToken");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDeal_paymentRef_key" ON "AgentDeal"("paymentRef");

-- CreateIndex
CREATE INDEX "AgentAlert_agentId_createdAt_idx" ON "AgentAlert"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtisanJobPayment_quoteId_key" ON "ArtisanJobPayment"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtisanJobPayment_paymentRef_key" ON "ArtisanJobPayment"("paymentRef");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_code_key" ON "Agent"("code");

-- AddForeignKey
ALTER TABLE "AgentDeal" ADD CONSTRAINT "AgentDeal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDeal" ADD CONSTRAINT "AgentDeal_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAlert" ADD CONSTRAINT "AgentAlert_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtisanJobPayment" ADD CONSTRAINT "ArtisanJobPayment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "RepairQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtisanJobPayment" ADD CONSTRAINT "ArtisanJobPayment_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "Artisan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

