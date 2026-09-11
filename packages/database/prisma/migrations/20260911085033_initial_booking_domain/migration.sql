BEGIN;

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "MarketplaceVisibility" AS ENUM ('UNLISTED', 'LISTED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationEventType" AS ENUM ('CREATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('MEMBER', 'GUEST', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "displayName" TEXT,
    "disabledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MemberRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL,
    "marketplaceVisibility" "MarketplaceVisibility" NOT NULL DEFAULT 'UNLISTED',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "publishedRevisionId" UUID,
    "acceptingReservations" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceRevision" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cancellationTerms" TEXT,
    "priceAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ExperienceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bookingClosesAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "occurrenceId" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customerFullName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "experienceSnapshot" JSONB NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "type" "ReservationEventType" NOT NULL,
    "actorKind" "ActorKind" NOT NULL,
    "actorMemberId" UUID,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_id_key" ON "OrganizationMember"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Business_organizationId_id_key" ON "Business"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_organizationId_id_key" ON "Experience"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_businessId_slug_key" ON "Experience"("businessId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceRevision_organizationId_experienceId_version_key" ON "ExperienceRevision"("organizationId", "experienceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceRevision_organizationId_experienceId_id_key" ON "ExperienceRevision"("organizationId", "experienceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Occurrence_organizationId_experienceId_id_key" ON "Occurrence"("organizationId", "experienceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Occurrence_organizationId_experienceId_startAt_endAt_key" ON "Occurrence"("organizationId", "experienceId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Reservation_organizationId_occurrenceId_status_idx" ON "Reservation"("organizationId", "occurrenceId", "status");

-- CreateIndex
CREATE INDEX "Reservation_organizationId_startAt_idx" ON "Reservation"("organizationId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_organizationId_id_key" ON "Reservation"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ReservationEvent_organizationId_reservationId_createdAt_idx" ON "ReservationEvent"("organizationId", "reservationId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_organizationId_id_publishedRevisionId_fkey" FOREIGN KEY ("organizationId", "id", "publishedRevisionId") REFERENCES "ExperienceRevision"("organizationId", "experienceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExperienceRevision" ADD CONSTRAINT "ExperienceRevision_organizationId_experienceId_fkey" FOREIGN KEY ("organizationId", "experienceId") REFERENCES "Experience"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_organizationId_experienceId_fkey" FOREIGN KEY ("organizationId", "experienceId") REFERENCES "Experience"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_organizationId_experienceId_revisionId_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId") REFERENCES "ExperienceRevision"("organizationId", "experienceId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_organizationId_experienceId_occurrenceId_fkey" FOREIGN KEY ("organizationId", "experienceId", "occurrenceId") REFERENCES "Occurrence"("organizationId", "experienceId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_organizationId_reservationId_fkey" FOREIGN KEY ("organizationId", "reservationId") REFERENCES "Reservation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_organizationId_actorMemberId_fkey" FOREIGN KEY ("organizationId", "actorMemberId") REFERENCES "OrganizationMember"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- BizzRes invariants that Prisma's schema language does not represent.
ALTER TABLE public."Business" ADD CONSTRAINT bizzres_business_currency_check CHECK ("defaultCurrency"::text COLLATE "C" ~ '^[A-Z]{3}$');
ALTER TABLE public."Experience" ADD CONSTRAINT bizzres_experience_accepting_check CHECK (NOT "acceptingReservations" OR ("publishedRevisionId" IS NOT NULL AND "archivedAt" IS NULL));
ALTER TABLE public."ExperienceRevision"
  ADD CONSTRAINT bizzres_revision_version_check CHECK ("version" > 0),
  ADD CONSTRAINT bizzres_revision_price_check CHECK ("priceAmount" >= 0 AND "priceAmount" <> 'NaN'::numeric),
  ADD CONSTRAINT bizzres_revision_name_check CHECK (btrim("name") <> ''),
  ADD CONSTRAINT bizzres_revision_currency_check CHECK ("currency"::text COLLATE "C" ~ '^[A-Z]{3}$');
ALTER TABLE public."Occurrence"
  ADD CONSTRAINT bizzres_occurrence_capacity_check CHECK ("capacity" > 0),
  ADD CONSTRAINT bizzres_occurrence_interval_check CHECK ("endAt" > "startAt");
ALTER TABLE public."Reservation"
  ADD CONSTRAINT bizzres_reservation_participants_check CHECK ("participantCount" > 0),
  ADD CONSTRAINT bizzres_reservation_interval_check CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT bizzres_reservation_amount_check CHECK ("totalAmount" >= 0 AND "totalAmount" <> 'NaN'::numeric),
  ADD CONSTRAINT bizzres_reservation_snapshot_version_check CHECK ("snapshotVersion" > 0),
  ADD CONSTRAINT bizzres_reservation_name_check CHECK (btrim("customerFullName") <> ''),
  ADD CONSTRAINT bizzres_reservation_phone_check CHECK (btrim("customerPhone") <> ''),
  ADD CONSTRAINT bizzres_reservation_email_check CHECK (btrim("customerEmail") <> ''),
  ADD CONSTRAINT bizzres_reservation_currency_check CHECK ("currency"::text COLLATE "C" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT bizzres_reservation_status_check CHECK (("status" = 'CONFIRMED' AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL));
ALTER TABLE public."ReservationEvent"
  ADD CONSTRAINT bizzres_event_payload_version_check CHECK ("payloadVersion" > 0),
  ADD CONSTRAINT bizzres_event_actor_check CHECK (("actorKind" = 'MEMBER' AND "actorMemberId" IS NOT NULL) OR ("actorKind" IN ('GUEST', 'SYSTEM') AND "actorMemberId" IS NULL));

CREATE FUNCTION public.bizzres_guard_revision_immutability() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Published experience revisions are immutable.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_revision_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bizzres_revision_immutability BEFORE UPDATE OR DELETE ON public."ExperienceRevision" FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_revision_immutability();

CREATE FUNCTION public.bizzres_validate_publication_pointer() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE revision_published_at timestamptz;
BEGIN
  IF NEW."publishedRevisionId" IS NULL THEN RETURN NEW; END IF;
  SELECT r."publishedAt" INTO revision_published_at FROM public."ExperienceRevision" AS r
    WHERE r."organizationId" = NEW."organizationId" AND r."experienceId" = NEW."id" AND r."id" = NEW."publishedRevisionId" FOR SHARE;
  IF FOUND AND revision_published_at IS NULL THEN
    RAISE EXCEPTION 'The publication pointer must reference a published revision.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_publication_requires_published_revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bizzres_publication_pointer BEFORE INSERT OR UPDATE OF "organizationId", "id", "publishedRevisionId" ON public."Experience" FOR EACH ROW EXECUTE FUNCTION public.bizzres_validate_publication_pointer();

CREATE FUNCTION public.bizzres_guard_reservation_event_history() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Reservation events are append-only.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_event_append_only';
END;
$$;
CREATE TRIGGER bizzres_reservation_event_append_only BEFORE UPDATE OR DELETE ON public."ReservationEvent" FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_reservation_event_history();

COMMIT;
