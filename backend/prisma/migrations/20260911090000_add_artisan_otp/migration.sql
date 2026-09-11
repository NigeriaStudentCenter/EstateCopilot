-- CreateTable
CREATE TABLE "ArtisanOtp" (
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtisanOtp_pkey" PRIMARY KEY ("phone")
);
