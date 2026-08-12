/**
 * Read-only diagnostic: checks whether the SapReconciliation table/migration exists,
 * and whether a row was recorded for a given gate pass number.
 * Run: npx tsx scripts/diag-sap-reconciliation.ts GP-0359
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const gpNumber = process.argv[2] || "GP-0359";

async function main() {
  console.log("--- Does SapReconciliation table exist? ---");
  const tableCheck = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables WHERE table_name = 'SapReconciliation'
    ) as exists
  `.catch((e) => { console.log("ERROR:", e.message); return null; });
  console.log(tableCheck);

  console.log(`--- ${gpNumber} lookup ---`);
  const gp = await prisma.gatePass.findFirst({
    where: { gatePassNumber: gpNumber },
    select: { id: true, gatePassNumber: true, chassis: true, vehicle: true, status: true, passType: true, toLocation: true, toPlantCode: true, toStorageLocation: true, updatedAt: true },
  });
  console.log(gp);

  if (gp) {
    console.log("--- SapReconciliation row for this gatePassId? ---");
    const row = await prisma.$queryRaw`SELECT * FROM "SapReconciliation" WHERE "gatePassId" = ${gp.id}`.catch((e) => { console.log("ERROR:", e.message); return null; });
    console.log(row);
  }

  console.log("--- All rows currently in SapReconciliation ---");
  const all = await prisma.$queryRaw`SELECT id, "gatePassId", "mmstaAtCompletion", "sdstaAtCompletion", eligibility, "ltCompletedAt" FROM "SapReconciliation"`.catch((e) => { console.log("ERROR:", e.message); return null; });
  console.log(all);
}
main().catch((e) => console.error(e)).finally(() => prisma.$disconnect());
