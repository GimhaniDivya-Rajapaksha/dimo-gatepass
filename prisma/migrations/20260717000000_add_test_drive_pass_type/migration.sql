-- Safe migration: adds the Test Drive pass type and its supporting columns.
-- Every statement uses IF NOT EXISTS so it is safe to run on any environment.
-- Purely additive — does not alter any existing column, enum value, or row.

-- ── PassType enum: add TEST_DRIVE ─────────────────────────────────────────────
ALTER TYPE "PassType" ADD VALUE IF NOT EXISTS 'TEST_DRIVE';

-- ── GatePass: Test Drive columns ──────────────────────────────────────────────
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "returnDate"      TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "returnTime"      TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "returnMileage"   TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "customerName"    TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "customerNIC"     TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "customerContact" TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "reminderSentAt"  TIMESTAMP(3);
