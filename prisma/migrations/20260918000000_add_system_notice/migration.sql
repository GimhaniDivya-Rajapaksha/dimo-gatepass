CREATE TABLE IF NOT EXISTS "SystemNotice" (
    "id"          TEXT NOT NULL DEFAULT 'singleton',
    "enabled"     BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "SystemNotice_pkey" PRIMARY KEY ("id")
);
