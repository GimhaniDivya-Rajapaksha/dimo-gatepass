import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT gp."chassis" as chassis
    FROM "SapReconciliation" sr
    JOIN "GatePass" gp ON gp."id" = sr."gatePassId"
    WHERE sr."eligibility" = 'READY' AND gp."chassis" IS NOT NULL
  `;
  console.log("readyChassis query result:", rows);

  const readyRows = await prisma.$queryRaw<any[]>`SELECT id, "gatePassId", eligibility FROM "SapReconciliation" WHERE eligibility = 'READY'`;
  console.log("plain READY rows:", readyRows);
}
main().finally(() => prisma.$disconnect());
