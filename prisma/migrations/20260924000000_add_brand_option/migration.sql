-- BrandOption existed in schema.prisma but had no tracked migration (it was created on
-- QA/Dev directly via `prisma db push`, which syncs schema without recording a migration).
-- Prod is only ever updated via `prisma migrate deploy`, so it never received this table.
-- IF NOT EXISTS makes this a no-op wherever the table is already present.
CREATE TABLE IF NOT EXISTS "BrandOption" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandOption_name_key" ON "BrandOption"("name");
