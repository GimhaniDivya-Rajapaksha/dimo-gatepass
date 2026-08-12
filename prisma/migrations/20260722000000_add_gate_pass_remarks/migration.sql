-- Safe migration: adds the new "Remarks" field to GatePass.
-- IF NOT EXISTS makes this safe to run on any environment.
-- Purely additive — does not alter any existing column, row, or default value.
-- Nullable at the DB level (existing passes have none); required at the application
-- level for every new submission across all pass types.

ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
