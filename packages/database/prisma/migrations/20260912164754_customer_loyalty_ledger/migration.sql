-- CreateEnum
CREATE TYPE "CustomerLoyaltyTransactionType" AS ENUM ('EARN', 'SPEND');

-- CreateTable
CREATE TABLE "CustomerLoyaltyAccount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerLoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLoyaltyTransaction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "reservationId" UUID,
    "type" "CustomerLoyaltyTransactionType" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLoyaltyAccount_userId_updatedAt_idx" ON "CustomerLoyaltyAccount"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLoyaltyAccount_organizationId_businessId_userId_key" ON "CustomerLoyaltyAccount"("organizationId", "businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLoyaltyAccount_organizationId_businessId_id_key" ON "CustomerLoyaltyAccount"("organizationId", "businessId", "id");

-- CreateIndex
CREATE INDEX "CustomerLoyaltyTransaction_organizationId_businessId_accoun_idx" ON "CustomerLoyaltyTransaction"("organizationId", "businessId", "accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyAccount" ADD CONSTRAINT "CustomerLoyaltyAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyAccount" ADD CONSTRAINT "CustomerLoyaltyAccount_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyAccount" ADD CONSTRAINT "CustomerLoyaltyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_organizationId_businessId_accou_fkey" FOREIGN KEY ("organizationId", "businessId", "accountId") REFERENCES "CustomerLoyaltyAccount"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyTransaction" ADD CONSTRAINT "CustomerLoyaltyTransaction_organizationId_reservationId_fkey" FOREIGN KEY ("organizationId", "reservationId") REFERENCES "Reservation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "CustomerLoyaltyAccount"
  ADD CONSTRAINT "CustomerLoyaltyAccount_balance_nonnegative" CHECK ("balance" >= 0);

ALTER TABLE "CustomerLoyaltyTransaction"
  ADD CONSTRAINT "CustomerLoyaltyTransaction_points_direction" CHECK (
    ("type" = 'EARN' AND "pointsDelta" > 0) OR
    ("type" = 'SPEND' AND "pointsDelta" < 0)
  ),
  ADD CONSTRAINT "CustomerLoyaltyTransaction_balance_nonnegative" CHECK ("balanceAfter" >= 0),
  ADD CONSTRAINT "CustomerLoyaltyTransaction_description_nonblank" CHECK (
    "description" IS NULL OR btrim("description") <> ''
  );

CREATE UNIQUE INDEX "CustomerLoyaltyTransaction_reservation_earn_key"
  ON "CustomerLoyaltyTransaction" ("organizationId", "reservationId")
  WHERE "type" = 'EARN' AND "reservationId" IS NOT NULL;

CREATE FUNCTION bizzres_apply_customer_loyalty_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance integer;
  reservation_matches boolean;
BEGIN
  SELECT "balance" INTO current_balance
  FROM "CustomerLoyaltyAccount"
  WHERE "organizationId" = NEW."organizationId"
    AND "businessId" = NEW."businessId"
    AND "id" = NEW."accountId"
  FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'loyalty account unavailable' USING ERRCODE = '23503';
  END IF;

  IF NEW."reservationId" IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM "Reservation" r
      JOIN "Experience" e
        ON e."organizationId" = r."organizationId"
       AND e."id" = r."experienceId"
      JOIN "CustomerLoyaltyAccount" a
        ON a."id" = NEW."accountId"
       AND a."organizationId" = NEW."organizationId"
       AND a."businessId" = NEW."businessId"
      WHERE r."organizationId" = NEW."organizationId"
        AND r."id" = NEW."reservationId"
        AND r."customerUserId" = a."userId"
        AND e."businessId" = NEW."businessId"
    ) INTO reservation_matches;
    IF NOT reservation_matches THEN
      RAISE EXCEPTION 'reservation does not belong to loyalty account' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW."balanceAfter" := current_balance + NEW."pointsDelta";
  IF NEW."balanceAfter" < 0 THEN
    RAISE EXCEPTION 'insufficient loyalty balance' USING ERRCODE = '23514';
  END IF;

  UPDATE "CustomerLoyaltyAccount"
  SET "balance" = NEW."balanceAfter", "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."accountId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER bizzres_customer_loyalty_transaction_apply
BEFORE INSERT ON "CustomerLoyaltyTransaction"
FOR EACH ROW EXECUTE FUNCTION bizzres_apply_customer_loyalty_transaction();

CREATE FUNCTION bizzres_customer_loyalty_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'customer loyalty transactions are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER bizzres_customer_loyalty_transaction_append_only
BEFORE UPDATE OR DELETE ON "CustomerLoyaltyTransaction"
FOR EACH ROW EXECUTE FUNCTION bizzres_customer_loyalty_append_only();

CREATE FUNCTION bizzres_customer_loyalty_balance_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."balance" <> OLD."balance" AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'loyalty balance can only change through its ledger' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bizzres_customer_loyalty_account_balance_guard
BEFORE UPDATE ON "CustomerLoyaltyAccount"
FOR EACH ROW EXECUTE FUNCTION bizzres_customer_loyalty_balance_guard();
