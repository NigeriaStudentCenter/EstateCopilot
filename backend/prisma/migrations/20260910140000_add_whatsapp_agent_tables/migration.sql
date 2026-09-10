-- CreateEnum
CREATE TYPE "WaBrand" AS ENUM ('ESTATECOPILOT', 'AI_ACADEMY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WaConversationState" AS ENUM ('AI_ACTIVE', 'HUMAN_ACTIVE', 'AWAITING_OPT_IN', 'CLOSED');

-- CreateEnum
CREATE TYPE "WaCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'DONE');

-- AlterTable
ALTER TABLE "WhatsAppMessage" ADD COLUMN     "brand" "WaBrand",
ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "templateName" TEXT;

-- CreateTable
CREATE TABLE "WaContact" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "displayName" TEXT,
    "linkedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConsent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "brand" "WaBrand" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT NOT NULL,
    "optInText" TEXT,
    "ip" TEXT,
    "optInAt" TIMESTAMP(3),
    "optOutAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversation" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "brand" "WaBrand" NOT NULL DEFAULT 'UNKNOWN',
    "state" "WaConversationState" NOT NULL DEFAULT 'AI_ACTIVE',
    "assignedOps" TEXT,
    "summary" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" "WaBrand" NOT NULL DEFAULT 'ESTATECOPILOT',
    "templateName" TEXT NOT NULL,
    "templateLang" TEXT NOT NULL DEFAULT 'en',
    "audienceQuery" JSONB NOT NULL,
    "scheduleAt" TIMESTAMP(3),
    "status" "WaCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_phone_key" ON "WaContact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "WaConsent_contactId_key" ON "WaConsent"("contactId");

-- CreateIndex
CREATE INDEX "WaConversation_contactId_state_idx" ON "WaConversation"("contactId", "state");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_conversationId_idx" ON "WhatsAppMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConsent" ADD CONSTRAINT "WaConsent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
