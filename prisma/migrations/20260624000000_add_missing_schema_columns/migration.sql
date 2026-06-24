-- Safe migration: adds all schema columns not covered by prior migrations.
-- Every statement uses IF NOT EXISTS so it is safe to run on any environment.

-- ── GatePassStatus enum: add values introduced after the initial schema push ──
ALTER TYPE "GatePassStatus" ADD VALUE IF NOT EXISTS 'INITIATOR_IN';
ALTER TYPE "GatePassStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "GatePassStatus" ADD VALUE IF NOT EXISTS 'CASHIER_REVIEW';

-- ── PassType enum (may already exist from db push) ───────────────────────────
DO $$ BEGIN
  CREATE TYPE "PassType" AS ENUM ('LOCATION_TRANSFER', 'CUSTOMER_DELIVERY', 'AFTER_SALES');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Role enum: add values introduced after the initial schema push ────────────
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AREA_SALES_OFFICER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CASHIER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SECURITY_OFFICER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SERVICE_ADVISOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DELIVERY_COORDINATOR';

-- ── User: columns added after initial push ────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "approverId"       TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultLocation"  TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetToken"       TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_resetToken_key" UNIQUE ("resetToken");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_approverId_fkey"
    FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── GatePass: passType column ─────────────────────────────────────────────────
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "passType" "PassType" NOT NULL DEFAULT 'LOCATION_TRANSFER';

-- ── GatePass: vehicle & identification columns ────────────────────────────────
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "vehicle"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "vehicleColor"  TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "shipmentId"    TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "chassis"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "make"          TEXT;

-- ── GatePass: location columns ────────────────────────────────────────────────
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "toLocation"        TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "toPlantCode"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "toStorageLocation" TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "arrivalDate"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "arrivalTime"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "fromLocation"        TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "fromPlantCode"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "fromStorageLocation" TEXT;

-- ── GatePass: transport & request columns ─────────────────────────────────────
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "vehicleDetails"  TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "requestedBy"     TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "requestedByEmail" TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "outReason"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "transportMode"   TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "companyName"     TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "carrierName"     TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "carrierRegNo"    TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "driverName"      TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "driverNIC"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "driverContact"   TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "mileage"         TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "insurance"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "garagePlate"     TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "resubmitCount"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "resubmitNote"    TEXT;

-- ── GatePass: cashier / escalation columns ────────────────────────────────────
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "passSubType"                  TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "paymentType"                  TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "cashierCleared"               BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "creditApproved"               BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "creditRejected"               BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "hasCredit"                    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "hasImmediate"                 BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "singleOrderEscalated"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "singleOrderEscalatedApproverId" TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "escalationApproved"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "escalationRejectionReason"    TEXT;

-- ── GatePass: security / sub-pass columns ────────────────────────────────────
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "serviceJobNo"    TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "securityCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "gateDirection"   TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "parentPassId"    TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "sapVehicleId"    TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "asoCreated"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "gateOutBy"       TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "gateInBy"        TEXT;

DO $$ BEGIN
  ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_parentPassId_fkey"
    FOREIGN KEY ("parentPassId") REFERENCES "GatePass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── ServiceOrder table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ServiceOrder" (
    "id"              TEXT NOT NULL,
    "gatePassId"      TEXT NOT NULL,
    "orderId"         TEXT NOT NULL,
    "orderStatus"     TEXT NOT NULL,
    "orderStatusCode" TEXT NOT NULL DEFAULT '',
    "billingType"     TEXT NOT NULL DEFAULT '',
    "payTermCode"     TEXT NOT NULL DEFAULT '',
    "payTerm"         TEXT NOT NULL DEFAULT '',
    "cancelled"       BOOLEAN NOT NULL DEFAULT false,
    "isHappyPath"     BOOLEAN NOT NULL DEFAULT false,
    "isAssigned"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_gatePassId_fkey"
    FOREIGN KEY ("gatePassId") REFERENCES "GatePass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Notification table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Notification" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "message"   TEXT NOT NULL,
    "type"      TEXT NOT NULL DEFAULT 'INFO',
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "link"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── LocationLabel table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LocationLabel" (
    "id"              TEXT NOT NULL,
    "plantCode"       TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL,
    "label"           TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationLabel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocationLabel_plantCode_storageLocation_label_key"
    ON "LocationLabel"("plantCode", "storageLocation", "label");
