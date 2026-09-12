-- CreateEnum
CREATE TYPE "BusinessRewardTransactionType" AS ENUM ('EARN', 'SPEND');

-- CreateTable
CREATE TABLE "BusinessRewardAccount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessRewardAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRewardTransaction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" "BusinessRewardTransactionType" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessRewardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRewardAccount_organizationId_businessId_key" ON "BusinessRewardAccount"("organizationId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRewardAccount_organizationId_businessId_id_key" ON "BusinessRewardAccount"("organizationId", "businessId", "id");

-- CreateIndex
CREATE INDEX "BusinessRewardTransaction_organizationId_businessId_account_idx" ON "BusinessRewardTransaction"("organizationId", "businessId", "accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessRewardAccount" ADD CONSTRAINT "BusinessRewardAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BusinessRewardAccount" ADD CONSTRAINT "BusinessRewardAccount_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BusinessRewardTransaction" ADD CONSTRAINT "BusinessRewardTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BusinessRewardTransaction" ADD CONSTRAINT "BusinessRewardTransaction_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BusinessRewardTransaction" ADD CONSTRAINT "BusinessRewardTransaction_organizationId_businessId_accoun_fkey" FOREIGN KEY ("organizationId", "businessId", "accountId") REFERENCES "BusinessRewardAccount"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "BusinessRewardAccount" ADD CONSTRAINT "BusinessRewardAccount_balance_nonnegative" CHECK ("balance" >= 0);
ALTER TABLE "BusinessRewardTransaction"
  ADD CONSTRAINT "BusinessRewardTransaction_points_direction" CHECK (("type" = 'EARN' AND "pointsDelta" > 0) OR ("type" = 'SPEND' AND "pointsDelta" < 0)),
  ADD CONSTRAINT "BusinessRewardTransaction_balance_nonnegative" CHECK ("balanceAfter" >= 0),
  ADD CONSTRAINT "BusinessRewardTransaction_description_nonblank" CHECK ("description" IS NULL OR btrim("description") <> '');

CREATE FUNCTION bizzres_apply_business_reward_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_balance integer;
BEGIN
  SELECT "balance" INTO current_balance FROM "BusinessRewardAccount"
  WHERE "organizationId"=NEW."organizationId" AND "businessId"=NEW."businessId" AND "id"=NEW."accountId" FOR UPDATE;
  IF current_balance IS NULL THEN RAISE EXCEPTION 'business reward account unavailable' USING ERRCODE='23503'; END IF;
  NEW."balanceAfter" := current_balance + NEW."pointsDelta";
  IF NEW."balanceAfter" < 0 THEN RAISE EXCEPTION 'insufficient business reward balance' USING ERRCODE='23514'; END IF;
  UPDATE "BusinessRewardAccount" SET "balance"=NEW."balanceAfter", "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=NEW."accountId";
  RETURN NEW;
END; $$;
CREATE TRIGGER bizzres_business_reward_transaction_apply BEFORE INSERT ON "BusinessRewardTransaction" FOR EACH ROW EXECUTE FUNCTION bizzres_apply_business_reward_transaction();

CREATE FUNCTION bizzres_business_reward_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'business reward transactions are append-only' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER bizzres_business_reward_transaction_append_only BEFORE UPDATE OR DELETE ON "BusinessRewardTransaction" FOR EACH ROW EXECUTE FUNCTION bizzres_business_reward_append_only();

CREATE FUNCTION bizzres_business_reward_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."balance" <> OLD."balance" AND pg_trigger_depth() = 1 THEN RAISE EXCEPTION 'business reward balance can only change through its ledger' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER bizzres_business_reward_account_balance_guard BEFORE UPDATE ON "BusinessRewardAccount" FOR EACH ROW EXECUTE FUNCTION bizzres_business_reward_balance_guard();
