-- CreateEnum
CREATE TYPE "Role" AS ENUM ('INITIATOR', 'APPROVER', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('DIMO_TO_DIMO', 'DIMO_TO_DEALER', 'DIMO_TO_PROMOTION');

-- CreateEnum
CREATE TYPE "GatePassStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'GATE_OUT', 'RECEIVED', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatePass" (
    "id" TEXT NOT NULL,
    "gatePassNumber" TEXT NOT NULL,
    "chassisNumber" TEXT NOT NULL,
    "transferType" "TransferType" NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'GATE_OUT',
    "departureDate" TEXT NOT NULL,
    "departureTime" TEXT NOT NULL,
    "transportationDetails" TEXT NOT NULL,
    "comments" TEXT,
    "recipient" TEXT NOT NULL,
    "recipientLocation" TEXT,
    "status" "GatePassStatus" NOT NULL DEFAULT 'DRAFT',
    "isInvoiced" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "receivedAt" TIMESTAMP(3),
    "updatedChassisNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatePass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GatePass_gatePassNumber_key" ON "GatePass"("gatePassNumber");

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatePass" ADD CONSTRAINT "GatePass_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
