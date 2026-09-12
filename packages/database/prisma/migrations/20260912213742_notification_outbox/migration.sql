-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'BOOKING_CANCELLATION', 'BOOKING_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_deduplicationKey_key" ON "Notification"("deduplicationKey");

-- CreateIndex
CREATE INDEX "Notification_status_scheduledAt_idx" ON "Notification"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_reservationId_createdAt_idx" ON "Notification"("organizationId", "reservationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_reservationId_fkey" FOREIGN KEY ("organizationId", "reservationId") REFERENCES "Reservation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_recipient_email_nonblank" CHECK (btrim("recipientEmail") <> ''),
  ADD CONSTRAINT "Notification_deduplication_key_nonblank" CHECK (btrim("deduplicationKey") <> ''),
  ADD CONSTRAINT "Notification_payload_version_positive" CHECK ("payloadVersion" > 0),
  ADD CONSTRAINT "Notification_attempts_nonnegative" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "Notification_delivery_state_consistent" CHECK (
    ("status" = 'PENDING' AND "processingAt" IS NULL AND "sentAt" IS NULL AND "failedAt" IS NULL) OR
    ("status" = 'PROCESSING' AND "processingAt" IS NOT NULL AND "sentAt" IS NULL AND "failedAt" IS NULL) OR
    ("status" = 'SENT' AND "sentAt" IS NOT NULL AND "failedAt" IS NULL) OR
    ("status" = 'FAILED' AND "failedAt" IS NOT NULL AND "sentAt" IS NULL)
  );
