-- Which marketplace section(s) a short-let appears in: daily stays, student stays, or both.
ALTER TABLE "Property" ADD COLUMN "dailyStays" BOOLEAN NOT NULL DEFAULT true;
