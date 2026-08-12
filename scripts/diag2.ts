import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  console.log("--- Recent LT gate passes (last 3 hours, GATE_OUT/COMPLETED) ---");
  const recent = await prisma.gatePass.findMany({
    where: {
      passType: "LOCATION_TRANSFER",
      updatedAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    },
    select: { id: true, gatePassNumber: true, chassis: true, vehicle: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log(recent);

  console.log("--- All SapReconciliation rows ---");
  const rows = await prisma.$queryRaw`SELECT * FROM "SapReconciliation" ORDER BY "createdAt" DESC`.catch((e) => { console.log("ERR", e.message); return null; });
  console.log(rows);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
