CREATE TABLE IF NOT EXISTS "UserPlantMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plantName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPlantMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPlantMapping_userId_plantName_key" ON "UserPlantMapping"("userId", "plantName");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserPlantMapping_userId_fkey'
  ) THEN
    ALTER TABLE "UserPlantMapping"
      ADD CONSTRAINT "UserPlantMapping_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
