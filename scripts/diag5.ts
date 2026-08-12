import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT sr.id, sr.eligibility, sr."writtenAt", sr."writtenById", gp."gatePassNumber", gp.vehicle
    FROM "SapReconciliation" sr JOIN "GatePass" gp ON gp.id = sr."gatePassId"
    WHERE gp."gatePassNumber" IN ('GP-0366','GP-0367','GP-0368','GP-0369')
    ORDER BY gp."gatePassNumber"
  `;
  console.log(rows);
}
main().finally(() => prisma.$disconnect());
