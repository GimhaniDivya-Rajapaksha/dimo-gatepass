CREATE TABLE IF NOT EXISTS "DriverOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nic" TEXT NOT NULL,
    "contact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DriverOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriverOption_nic_key" ON "DriverOption"("nic");
