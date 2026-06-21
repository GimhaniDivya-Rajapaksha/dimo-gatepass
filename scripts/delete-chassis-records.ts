/**
 * Delete specific gate pass records by chassis number.
 *
 * Run on the QA server:
 *   npx tsx scripts/delete-chassis-records.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHASSIS_TO_DELETE = [
  "WDD205077789488",
  "WDD205077789487",
  "WDD205077789486",
];

async function main() {
  const passes = await (prisma.gatePass as any).findMany({
    where: { chassis: { in: CHASSIS_TO_DELETE } },
    select: { id: true, gatePassNumber: true, chassis: true, passType: true, status: true },
  });

  if (passes.length === 0) {
    console.log("No records found for the given chassis numbers. Nothing to delete.");
    return;
  }

  console.log(`\nFound ${passes.length} record(s) to delete:\n`);
  for (const p of passes) {
    console.log(`  ${p.gatePassNumber}  chassis: ${p.chassis}  [${p.passType}]  status: ${p.status}`);
  }

  const ids = passes.map((p: { id: string }) => p.id);

  const deletedOrders = await (prisma as any).serviceOrder.deleteMany({ where: { gatePassId: { in: ids } } });
  console.log(`\nDeleted ${deletedOrders.count} service order(s)`);

  const deletedNotifs = await (prisma as any).notification.deleteMany({ where: { gatePassId: { in: ids } } });
  console.log(`Deleted ${deletedNotifs.count} notification(s)`);

  // Remove child passes first (parentPassId FK)
  const deletedChildren = await (prisma.gatePass as any).deleteMany({ where: { parentPassId: { in: ids } } });
  console.log(`Deleted ${deletedChildren.count} child pass(es)`);

  const deletedPasses = await (prisma.gatePass as any).deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${deletedPasses.count} gate pass(es)`);

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
