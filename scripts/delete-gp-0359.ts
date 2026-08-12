/**
 * One-off cleanup: deletes the test gate pass GP-0359 (chassis W1K2050761212123) and its
 * related child rows (Notification, ServiceOrder, GatePassChangeLog, SapReconciliation).
 * Run: npx tsx scripts/delete-gp-0359.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const GP_NUMBER = "GP-0359";
const CHASSIS = "W1K2050761212123";

async function main() {
  const gp = await prisma.gatePass.findFirst({
    where: { gatePassNumber: GP_NUMBER, chassis: CHASSIS },
  });

  if (!gp) {
    console.log(`No gate pass found matching gatePassNumber=${GP_NUMBER} and chassis=${CHASSIS} — nothing deleted.`);
    return;
  }

  const subPasses = await prisma.gatePass.findMany({ where: { parentPassId: gp.id }, select: { id: true, gatePassNumber: true } });
  if (subPasses.length > 0) {
    console.log("Aborting — this gate pass has sub-passes referencing it as parent:", subPasses);
    return;
  }

  console.log("Deleting related records for:", { id: gp.id, gatePassNumber: gp.gatePassNumber, chassis: gp.chassis });

  const [notifDel, soDel, logDel] = await prisma.$transaction([
    prisma.notification.deleteMany({ where: { gatePassId: gp.id } }),
    prisma.serviceOrder.deleteMany({ where: { gatePassId: gp.id } }),
    prisma.gatePassChangeLog.deleteMany({ where: { gatePassId: gp.id } }),
  ]);
  console.log(`Deleted ${notifDel.count} notifications, ${soDel.count} service orders, ${logDel.count} change logs.`);

  await prisma.$executeRaw`DELETE FROM "SapReconciliationAuditLog" WHERE "gatePassId" = ${gp.id}`.catch(() => {});
  await prisma.$executeRaw`DELETE FROM "SapReconciliation" WHERE "gatePassId" = ${gp.id}`.catch(() => {});

  await prisma.gatePass.delete({ where: { id: gp.id } });
  console.log(`Deleted gate pass ${GP_NUMBER} (${CHASSIS}).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
