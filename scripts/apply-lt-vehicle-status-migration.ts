/**
 * Applies the LtVehicleStatusOption migration via the working pooler connection
 * (DATABASE_URL), since `prisma db execute` requires the direct (non-pooled) host which is
 * unreachable here (same IPv6 issue as the SapReconciliation migration).
 * Run: npx tsx scripts/apply-lt-vehicle-status-migration.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const statements = [
  `CREATE TABLE IF NOT EXISTS "LtVehicleStatusOption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LtVehicleStatusOption_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LtVehicleStatusOption_code_key" ON "LtVehicleStatusOption"("code")`,
];

async function main() {
  for (const [i, sql] of statements.entries()) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`Statement ${i + 1}/${statements.length} OK`);
  }
  console.log("Migration applied successfully.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
