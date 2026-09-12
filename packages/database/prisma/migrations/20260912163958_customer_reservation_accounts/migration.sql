-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "customerUserId" UUID;

-- CreateIndex
CREATE INDEX "Reservation_customerUserId_createdAt_idx" ON "Reservation"("customerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
