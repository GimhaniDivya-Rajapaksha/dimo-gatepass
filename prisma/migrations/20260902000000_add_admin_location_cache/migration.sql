CREATE TABLE IF NOT EXISTS "AdminLocationCache" (
    "id"                 TEXT NOT NULL,
    "plantDescription"   TEXT NOT NULL,
    "storageDescription" TEXT NOT NULL,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminLocationCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminLocationCache_plantDescription_storageDescription_key"
    ON "AdminLocationCache"("plantDescription", "storageDescription");
