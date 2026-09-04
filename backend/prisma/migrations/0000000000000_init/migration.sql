-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('LONG_TERM', 'SHORT_LET');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'PENDING', 'OVERDUE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LevyStatus" AS ENUM ('CLEARED', 'ARREARS');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('RENT', 'CAUTION_DEPOSIT', 'UTILITY', 'LEVY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'DISPATCHED', 'AWAITING_TENANT_SIGNOFF', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RepairResponsibility" AS ENUM ('LANDLORD', 'TENANT', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "RentPaymentPlan" AS ENUM ('FULL', 'INSTALLMENTS');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "CorrespondenceChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'NOTE', 'PORTAL');

-- CreateEnum
CREATE TYPE "CorrespondenceDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'EDITED_AND_SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('PROPERTY_VIEWING', 'REPAIR_QUOTE_VISIT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Landlord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Lagos',
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paystackCustomerCode" TEXT,
    "paystackSubscriptionCode" TEXT,
    "paystackPlanCode" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "bankAccountNumber" TEXT,
    "bankCode" TEXT,
    "bankAccountName" TEXT,
    "paystackSubaccountCode" TEXT,

    CONSTRAINT "Landlord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lga" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "rentAmount" INTEGER NOT NULL,
    "cautionDepositAmount" INTEGER NOT NULL,
    "municipalId" TEXT,
    "discoProvider" TEXT,
    "meterNumber" TEXT,
    "isAdvertised" BOOLEAN NOT NULL DEFAULT false,
    "listingDescription" TEXT,
    "imageUrls" TEXT[],
    "landlordId" TEXT NOT NULL,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "nin" TEXT,
    "bvn" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guarantor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "employer" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guarantor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaseStart" TIMESTAMP(3) NOT NULL,
    "leaseEnd" TIMESTAMP(3) NOT NULL,
    "rentAmount" INTEGER NOT NULL,
    "paymentStatus" "LeaseStatus" NOT NULL DEFAULT 'PENDING',
    "cautionDepositHeld" INTEGER NOT NULL DEFAULT 0,
    "cautionDepositReleased" BOOLEAN NOT NULL DEFAULT false,
    "virtualAccountRef" TEXT,
    "paymentPlan" "RentPaymentPlan" NOT NULL DEFAULT 'FULL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentInstallment" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "paystackRequestCode" TEXT,
    "paymentLink" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondence" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "channel" "CorrespondenceChannel" NOT NULL,
    "direction" "CorrespondenceDirection" NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrespondenceDraft" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "inReplyToBody" TEXT NOT NULL,
    "suggestedBody" TEXT NOT NULL,
    "channel" "CorrespondenceChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "sentBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CorrespondenceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "landlordPayoutAmount" INTEGER,
    "platformFeeAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Levy" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "status" "LevyStatus" NOT NULL DEFAULT 'ARREARS',
    "periodLabel" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Levy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryLabel" TEXT,
    "responsibility" "RepairResponsibility" NOT NULL DEFAULT 'UNCLEAR',
    "raisedBy" TEXT,
    "sourceMessage" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "openToMarketplace" BOOLEAN NOT NULL DEFAULT false,
    "artisanName" TEXT,
    "artisanPhone" TEXT,
    "proofPhotoUrls" TEXT[],
    "tenantSignedOff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairQuote" (
    "id" TEXT NOT NULL,
    "maintenanceTicketId" TEXT NOT NULL,
    "handymanName" TEXT NOT NULL,
    "handymanPhone" TEXT NOT NULL,
    "handymanEmail" TEXT,
    "amount" INTEGER NOT NULL,
    "message" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "propertyId" TEXT,
    "maintenanceTicketId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterPhone" TEXT NOT NULL,
    "requesterEmail" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "waMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Landlord_phone_key" ON "Landlord"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Landlord_email_key" ON "Landlord"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_phone_key" ON "Agent"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_phone_key" ON "Tenant"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Guarantor_tenantId_key" ON "Guarantor"("tenantId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guarantor" ADD CONSTRAINT "Guarantor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentInstallment" ADD CONSTRAINT "RentInstallment_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceDraft" ADD CONSTRAINT "CorrespondenceDraft_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Levy" ADD CONSTRAINT "Levy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairQuote" ADD CONSTRAINT "RepairQuote_maintenanceTicketId_fkey" FOREIGN KEY ("maintenanceTicketId") REFERENCES "MaintenanceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_maintenanceTicketId_fkey" FOREIGN KEY ("maintenanceTicketId") REFERENCES "MaintenanceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

