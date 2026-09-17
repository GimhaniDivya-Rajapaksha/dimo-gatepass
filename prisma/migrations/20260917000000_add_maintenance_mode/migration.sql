CREATE TABLE IF NOT EXISTS "MaintenanceMode" (
    "id"          TEXT NOT NULL DEFAULT 'singleton',
    "enabled"     BOOLEAN NOT NULL DEFAULT false,
    "message"     TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "MaintenanceMode_pkey" PRIMARY KEY ("id")
);
