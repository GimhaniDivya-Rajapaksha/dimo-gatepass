import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT sr.id, sr."gatePassId", sr.eligibility, sr."latestMmsta", sr."latestSdsta", sr."lastCheckedAt", gp."gatePassNumber", gp.vehicle
    FROM "SapReconciliation" sr JOIN "GatePass" gp ON gp.id = sr."gatePassId"
    WHERE sr.eligibility != 'WRITTEN'
    ORDER BY sr."ltCompletedAt" ASC
  `;
  console.log(rows);
}
main().finally(() => prisma.$disconnect());
