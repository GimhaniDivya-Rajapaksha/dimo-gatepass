-- Safe migration: adds the Location Transfer "Return Gate Pass" locking field.
-- Uses IF NOT EXISTS so it is safe to run on any environment.
-- Purely additive — does not alter any existing column, row, or default value.
-- Defaults to false for every existing and future normal gate pass, so no
-- existing pass of any type is ever affected by this column's presence.

ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "returnPassLocked" BOOLEAN NOT NULL DEFAULT false;
