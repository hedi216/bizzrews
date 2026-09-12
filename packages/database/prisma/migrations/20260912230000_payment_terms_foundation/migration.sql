-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED', 'DEPOSIT');

-- AlterTable
ALTER TABLE "ExperienceRevision" ADD COLUMN     "depositAmount" DECIMAL(19,4),
ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'NONE';

ALTER TABLE public."ExperienceRevision"
  ADD CONSTRAINT bizzres_revision_payment_terms_check CHECK (
    ("paymentMode" = 'NONE' AND "depositAmount" IS NULL)
    OR
    ("paymentMode" IN ('OPTIONAL', 'REQUIRED') AND "priceAmount" > 0 AND "depositAmount" IS NULL)
    OR
    ("paymentMode" = 'DEPOSIT' AND "priceAmount" > 0 AND "depositAmount" > 0 AND "depositAmount" <= "priceAmount" AND "depositAmount" <> 'NaN'::numeric)
  );
