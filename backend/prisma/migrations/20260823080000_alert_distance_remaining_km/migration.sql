-- Autonomy is now expressed in km (distance to empty) instead of minutes.
ALTER TABLE "Alert" RENAME COLUMN "minutesRemaining" TO "distanceRemainingKm";
