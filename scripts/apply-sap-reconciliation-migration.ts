/**
 * Applies the SapReconciliation migration via the working pooler connection (DATABASE_URL),
 * since `prisma db execute` requires the direct (non-pooled) host which is unreachable here.
 * Run: npx tsx scripts/apply-sap-reconciliation-migration.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const statements = [
  `CREATE TABLE IF NOT EXISTS "SapReconciliation" (
    "id" TEXT NOT NULL,
    "gatePassId" TEXT NOT NULL,
    "ltCompletedAt" TIMESTAMP(3) NOT NULL,
    "mmstaAtCompletion" TEXT NOT NULL,
    "sdstaAtCompletion" TEXT NOT NULL,
    "latestMmsta" TEXT,
    "latestSdsta" TEXT,
    "eligibility" TEXT NOT NULL DEFAULT 'PENDING',
    "lastCheckedAt" TIMESTAMP(3),
    "writtenAt" TIMESTAMP(3),
    "writtenById" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SapReconciliation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SapReconciliation_gatePassId_key" ON "SapReconciliation"("gatePassId")`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SapReconciliation_gatePassId_fkey') THEN
       ALTER TABLE "SapReconciliation"
         ADD CONSTRAINT "SapReconciliation_gatePassId_fkey"
         FOREIGN KEY ("gatePassId") REFERENCES "GatePass"("id")
         ON DELETE RESTRICT ON UPDATE CASCADE;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SapReconciliation_writtenById_fkey') THEN
       ALTER TABLE "SapReconciliation"
         ADD CONSTRAINT "SapReconciliation_writtenById_fkey"
         FOREIGN KEY ("writtenById") REFERENCES "User"("id")
         ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS "SapReconciliationAuditLog" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "gatePassId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "triggeredById" TEXT,
    "triggeredByName" TEXT NOT NULL,
    "mmstaAtCheck" TEXT,
    "sdstaAtCheck" TEXT,
    "success" BOOLEAN,
    "responseMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SapReconciliationAuditLog_pkey" PRIMARY KEY ("id")
  )`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SapReconciliationAuditLog_reconciliationId_fkey') THEN
       ALTER TABLE "SapReconciliationAuditLog"
         ADD CONSTRAINT "SapReconciliationAuditLog_reconciliationId_fkey"
         FOREIGN KEY ("reconciliationId") REFERENCES "SapReconciliation"("id")
         ON DELETE RESTRICT ON UPDATE CASCADE;
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS "SapReconciliationAuditLog_reconciliationId_idx" ON "SapReconciliationAuditLog"("reconciliationId")`,
];

async function main() {
  for (const [i, sql] of statements.entries()) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`Statement ${i + 1}/${statements.length} OK`);
  }
  console.log("Migration applied successfully.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
