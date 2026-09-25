CREATE TABLE IF NOT EXISTS "PlantMaterial" (
    "id"         TEXT NOT NULL,
    "materialNo" TEXT NOT NULL,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlantMaterial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlantMaterial_materialNo_key" ON "PlantMaterial"("materialNo");

CREATE TABLE IF NOT EXISTS "PlantLocationNode" (
    "id"                 TEXT NOT NULL,
    "plantCode"          TEXT NOT NULL,
    "storageLocation"    TEXT NOT NULL,
    "plantDescription"   TEXT NOT NULL,
    "storageDescription" TEXT NOT NULL,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlantLocationNode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlantLocationNode_plantCode_storageLocation_key" ON "PlantLocationNode"("plantCode", "storageLocation");

CREATE TABLE IF NOT EXISTS "PlantMaterialDestination" (
    "id"         TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlantMaterialDestination_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlantMaterialDestination_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "PlantMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlantMaterialDestination_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "PlantLocationNode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlantMaterialDestination_materialId_locationId_key" ON "PlantMaterialDestination"("materialId", "locationId");

CREATE TABLE IF NOT EXISTS "PlantVehicleCache" (
    "id"                 TEXT NOT NULL,
    "chassisNo"          TEXT NOT NULL,
    "internalNo"         TEXT NOT NULL,
    "externalNo"         TEXT NOT NULL,
    "materialNo"         TEXT NOT NULL,
    "materialId"         TEXT,
    "plantCode"          TEXT NOT NULL,
    "plantDescription"   TEXT NOT NULL,
    "storageLocation"    TEXT NOT NULL,
    "storageDescription" TEXT NOT NULL,
    "vehicleGuid"        TEXT NOT NULL,
    "moduleGuid"         TEXT NOT NULL,
    "modelCode"          TEXT NOT NULL,
    "syncedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlantVehicleCache_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlantVehicleCache_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "PlantMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlantVehicleCache_chassisNo_key" ON "PlantVehicleCache"("chassisNo");
CREATE INDEX IF NOT EXISTS "PlantVehicleCache_materialNo_idx" ON "PlantVehicleCache"("materialNo");
CREATE INDEX IF NOT EXISTS "PlantVehicleCache_internalNo_idx" ON "PlantVehicleCache"("internalNo");
CREATE INDEX IF NOT EXISTS "PlantVehicleCache_externalNo_idx" ON "PlantVehicleCache"("externalNo");

CREATE TABLE IF NOT EXISTS "PlantCacheSyncLog" (
    "id"            TEXT NOT NULL,
    "startedAt"     TIMESTAMP(3) NOT NULL,
    "finishedAt"    TIMESTAMP(3),
    "status"        TEXT NOT NULL,
    "vehicleCount"  INTEGER,
    "locationCount" INTEGER,
    "trigger"       TEXT NOT NULL,
    "mode"          TEXT,
    "triggeredById" TEXT,
    "error"         TEXT,
    CONSTRAINT "PlantCacheSyncLog_pkey" PRIMARY KEY ("id")
);
