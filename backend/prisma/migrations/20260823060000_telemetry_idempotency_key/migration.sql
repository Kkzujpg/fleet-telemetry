-- AlterTable
ALTER TABLE "TelemetryReading" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryReading_deviceId_idempotencyKey_key" ON "TelemetryReading"("deviceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TelemetryReading_ingestedAt_idx" ON "TelemetryReading"("ingestedAt");
