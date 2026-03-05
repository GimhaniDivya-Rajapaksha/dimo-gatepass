-- CreateTable
CREATE TABLE "LocationOption" (
    "id" TEXT NOT NULL,
    "plantCode" TEXT NOT NULL,
    "plantDescription" TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL,
    "storageDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestedByOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestedByOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutReasonOption" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutReasonOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleOption" (
    "id" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "chassisNo" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocationOption_plantCode_storageLocation_key" ON "LocationOption"("plantCode", "storageLocation");

-- CreateIndex
CREATE UNIQUE INDEX "RequestedByOption_name_key" ON "RequestedByOption"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OutReasonOption_value_key" ON "OutReasonOption"("value");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleOption_vehicleNo_key" ON "VehicleOption"("vehicleNo");
