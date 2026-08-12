CREATE TABLE IF NOT EXISTS "LtVehicleStatusOption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LtVehicleStatusOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LtVehicleStatusOption_code_key" ON "LtVehicleStatusOption"("code");
