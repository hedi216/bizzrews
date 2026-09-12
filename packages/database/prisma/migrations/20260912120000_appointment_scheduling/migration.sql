-- CreateEnum
CREATE TYPE "SchedulingMode" AS ENUM ('EXPLICIT_OCCURRENCES', 'GENERATED_SLOTS');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- DropForeignKey
ALTER TABLE "Occurrence" DROP CONSTRAINT "Occurrence_organizationId_experienceId_fkey";

-- AlterTable
ALTER TABLE "ExperienceRevision" ADD COLUMN     "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "schedulingMode" "SchedulingMode" NOT NULL DEFAULT 'EXPLICIT_OCCURRENCES',
ADD COLUMN     "slotIntervalMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Occurrence" ADD COLUMN "businessId" UUID,
ADD COLUMN "resourceId" UUID;
UPDATE "Occurrence" o SET "businessId" = e."businessId"
FROM "Experience" e
WHERE e."organizationId" = o."organizationId" AND e."id" = o."experienceId";
ALTER TABLE "Occurrence" ALTER COLUMN "businessId" SET NOT NULL;

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceResource" (
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceResource_pkey" PRIMARY KEY ("organizationId","experienceId","resourceId")
);

-- CreateTable
CREATE TABLE "ResourceWeeklyAvailability" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startLocalTime" TIME(0) NOT NULL,
    "endLocalTime" TIME(0) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResourceWeeklyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAvailabilityOverride" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "available" BOOLEAN NOT NULL,
    "startLocalTime" TIME(0),
    "endLocalTime" TIME(0),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResourceAvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resource_organizationId_businessId_active_createdAt_id_idx" ON "Resource"("organizationId", "businessId", "active", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_organizationId_businessId_id_key" ON "Resource"("organizationId", "businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_organizationId_id_key" ON "Resource"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ExperienceResource_organizationId_businessId_resourceId_idx" ON "ExperienceResource"("organizationId", "businessId", "resourceId");

-- CreateIndex
CREATE INDEX "ResourceWeeklyAvailability_organizationId_resourceId_dayOfW_idx" ON "ResourceWeeklyAvailability"("organizationId", "resourceId", "dayOfWeek", "startLocalTime");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceWeeklyAvailability_organizationId_resourceId_dayOfW_key" ON "ResourceWeeklyAvailability"("organizationId", "resourceId", "dayOfWeek", "startLocalTime", "endLocalTime");

-- CreateIndex
CREATE INDEX "ResourceAvailabilityOverride_organizationId_resourceId_date_idx" ON "ResourceAvailabilityOverride"("organizationId", "resourceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceAvailabilityOverride_organizationId_resourceId_date_key" ON "ResourceAvailabilityOverride"("organizationId", "resourceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_organizationId_businessId_id_key" ON "Experience"("organizationId", "businessId", "id");

-- Replace the old interval uniqueness so different assigned resources may
-- serve the same Experience concurrently while each generated slot remains unique.
DROP INDEX "Occurrence_organizationId_experienceId_startAt_endAt_key";
CREATE INDEX "Occurrence_organizationId_experienceId_startAt_idx" ON "Occurrence"("organizationId", "experienceId", "startAt");
CREATE UNIQUE INDEX "bizzres_occurrence_explicit_interval_key" ON "Occurrence"("organizationId", "experienceId", "startAt", "endAt") WHERE "resourceId" IS NULL;
CREATE UNIQUE INDEX "bizzres_occurrence_resource_interval_key" ON "Occurrence"("organizationId", "resourceId", "startAt", "endAt") WHERE "resourceId" IS NOT NULL;

ALTER TABLE "ExperienceRevision"
  ADD CONSTRAINT "bizzres_revision_scheduling_check" CHECK (
    ("schedulingMode" = 'EXPLICIT_OCCURRENCES' AND "durationMinutes" IS NULL AND "slotIntervalMinutes" IS NULL)
    OR
    ("schedulingMode" = 'GENERATED_SLOTS' AND "durationMinutes" BETWEEN 1 AND 1440 AND "slotIntervalMinutes" BETWEEN 1 AND 1440)
  ),
  ADD CONSTRAINT "bizzres_revision_buffers_check" CHECK ("bufferBeforeMinutes" BETWEEN 0 AND 1440 AND "bufferAfterMinutes" BETWEEN 0 AND 1440);
ALTER TABLE "Resource"
  ADD CONSTRAINT "bizzres_resource_name_check" CHECK (btrim("name") <> '');
ALTER TABLE "ResourceWeeklyAvailability"
  ADD CONSTRAINT "bizzres_weekly_window_check" CHECK ("startLocalTime" < "endLocalTime");
ALTER TABLE "ResourceAvailabilityOverride"
  ADD CONSTRAINT "bizzres_override_window_check" CHECK (
    (NOT "available" AND "startLocalTime" IS NULL AND "endLocalTime" IS NULL)
    OR
    ("available" AND "startLocalTime" IS NOT NULL AND "endLocalTime" IS NOT NULL AND "startLocalTime" < "endLocalTime")
  );

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_organizationId_businessId_experienceId_fkey" FOREIGN KEY ("organizationId", "businessId", "experienceId") REFERENCES "Experience"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_organizationId_businessId_resourceId_fkey" FOREIGN KEY ("organizationId", "businessId", "resourceId") REFERENCES "Resource"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExperienceResource" ADD CONSTRAINT "ExperienceResource_organizationId_businessId_experienceId_fkey" FOREIGN KEY ("organizationId", "businessId", "experienceId") REFERENCES "Experience"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExperienceResource" ADD CONSTRAINT "ExperienceResource_organizationId_businessId_resourceId_fkey" FOREIGN KEY ("organizationId", "businessId", "resourceId") REFERENCES "Resource"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ResourceWeeklyAvailability" ADD CONSTRAINT "ResourceWeeklyAvailability_organizationId_businessId_resou_fkey" FOREIGN KEY ("organizationId", "businessId", "resourceId") REFERENCES "Resource"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ResourceAvailabilityOverride" ADD CONSTRAINT "ResourceAvailabilityOverride_organizationId_businessId_res_fkey" FOREIGN KEY ("organizationId", "businessId", "resourceId") REFERENCES "Resource"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
