/**
 * One-time QA cleanup: delete CUSTOMER_DELIVERY and AFTER_SALES MAIN_OUT
 * gate passes created before today (2026-06-20), plus their related
 * ServiceOrders and Notifications.
 *
 * Run on the QA server ONLY:
 *   npx tsx scripts/cleanup-old-orders-qa.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Cutoff: start of 2026-06-20 in Sri Lanka time (UTC+5:30 = 2026-06-19T18:30:00Z)
  const cutoff = new Date("2026-06-20T00:00:00+05:30");

  const where = {
    createdAt: { lt: cutoff },
    OR: [
      { passType: "CUSTOMER_DELIVERY" },
      { passType: "AFTER_SALES", passSubType: "MAIN_OUT" },
    ],
  } as const;

  // Preview what will be deleted
  const passes = await (prisma.gatePass as any).findMany({
    where,
    select: { id: true, gatePassNumber: true, passType: true, passSubType: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (passes.length === 0) {
    console.log("No old CD / AS MAIN_OUT records found before 2026-06-20. Nothing to delete.");
    return;
  }

  console.log(`\nFound ${passes.length} record(s) to delete:\n`);
  for (const p of passes) {
    const type = p.passType === "AFTER_SALES" ? "AS MAIN_OUT" : "CD";
    console.log(`  ${p.gatePassNumber}  [${type}]  created: ${new Date(p.createdAt).toISOString()}`);
  }

  const ids = passes.map((p: { id: string }) => p.id);

  // Delete child records first to avoid FK constraint errors
  const deletedOrders = await (prisma as any).serviceOrder.deleteMany({
    where: { gatePassId: { in: ids } },
  });
  console.log(`\nDeleted ${deletedOrders.count} service order(s)`);

  const deletedNotifs = await (prisma as any).notification.deleteMany({
    where: { gatePassId: { in: ids } },
  });
  console.log(`Deleted ${deletedNotifs.count} notification(s)`);

  const deletedPasses = await (prisma.gatePass as any).deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`Deleted ${deletedPasses.count} gate pass(es)`);

  console.log("\nDone. Only today's (2026-06-20) CD and AS MAIN_OUT records remain.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
