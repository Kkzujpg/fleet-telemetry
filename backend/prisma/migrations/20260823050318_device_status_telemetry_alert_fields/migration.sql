-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- DropIndex
DROP INDEX "TelemetryReading_deviceId_recordedAt_idx";

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "acknowledgedBy" TEXT;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "TelemetryReading" ADD COLUMN     "fuelLevelPct" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "odometerKm" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE INDEX "TelemetryReading_deviceId_recordedAt_idx" ON "TelemetryReading"("deviceId", "recordedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryReading_deviceId_recordedAt_key" ON "TelemetryReading"("deviceId", "recordedAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_acknowledgedBy_fkey" FOREIGN KEY ("acknowledgedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

