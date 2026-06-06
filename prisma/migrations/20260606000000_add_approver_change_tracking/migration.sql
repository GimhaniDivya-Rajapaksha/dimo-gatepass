ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "previousApprover" TEXT;
ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "approverChangeReason" TEXT;
