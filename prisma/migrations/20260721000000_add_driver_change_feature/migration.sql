-- Safe migration: adds support for post-print Driver changes with a full audit trail,
-- plus Driving Licence No. and Carrier mapping on the driver master data.
-- Every statement is IF NOT EXISTS / guarded so it is safe to run on any environment.
-- Purely additive — does not alter any existing column, row, or default value.

-- ── GatePass: current driver's licence number (set only via the Change Driver feature) ──
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "driverLicenceNo" TEXT;

-- ── DriverOption: Driving Licence No. + Carrier mapping ──────────────────────────────────
ALTER TABLE "DriverOption" ADD COLUMN IF NOT EXISTS "licenceNo" TEXT;
ALTER TABLE "DriverOption" ADD COLUMN IF NOT EXISTS "carrierId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "DriverOption_licenceNo_key" ON "DriverOption"("licenceNo");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DriverOption_carrierId_fkey'
  ) THEN
    ALTER TABLE "DriverOption"
      ADD CONSTRAINT "DriverOption_carrierId_fkey"
      FOREIGN KEY ("carrierId") REFERENCES "CarrierOption"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── GatePassChangeLog: audit trail for post-print field changes ─────────────────────────
CREATE TABLE IF NOT EXISTS "GatePassChangeLog" (
    "id"           TEXT NOT NULL,
    "gatePassId"   TEXT NOT NULL,
    "changeType"   TEXT NOT NULL,
    "previousData" JSONB NOT NULL,
    "newData"      JSONB NOT NULL,
    "reason"       TEXT,
    "changedById"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatePassChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GatePassChangeLog_gatePassId_idx" ON "GatePassChangeLog"("gatePassId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GatePassChangeLog_gatePassId_fkey'
  ) THEN
    ALTER TABLE "GatePassChangeLog"
      ADD CONSTRAINT "GatePassChangeLog_gatePassId_fkey"
      FOREIGN KEY ("gatePassId") REFERENCES "GatePass"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GatePassChangeLog_changedById_fkey'
  ) THEN
    ALTER TABLE "GatePassChangeLog"
      ADD CONSTRAINT "GatePassChangeLog_changedById_fkey"
      FOREIGN KEY ("changedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
