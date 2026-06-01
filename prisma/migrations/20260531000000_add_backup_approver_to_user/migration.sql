ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "backupApproverId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_backupApproverId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_backupApproverId_fkey"
      FOREIGN KEY ("backupApproverId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
