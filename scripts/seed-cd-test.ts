/**
 * Seed 2 Customer Delivery test gate passes:
 *   CD-TEST-1 → CASHIER_REVIEW (immediate payment) → appears in Cashier tab
 *   CD-TEST-2 → PENDING_APPROVAL (credit payment)  → appears in Approver queue
 *
 * Run: npx tsx scripts/seed-cd-test.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find an initiator user to use as creator
  const initiator = await prisma.user.findFirst({ where: { role: "INITIATOR" } });
  if (!initiator) { console.error("No INITIATOR user found. Run seed first."); process.exit(1); }

  // ── Test Case 1: IMMEDIATE payment → goes to Cashier ─────────────────────
  const last1 = await prisma.gatePass.findFirst({ orderBy: { gatePassNumber: "desc" } });
  const num1 = last1 ? parseInt(last1.gatePassNumber.replace(/^GP-/, ""), 10) + 1 : 1;
  const gp1 = await (prisma.gatePass as any).create({
    data: {
      gatePassNumber: `GP-${String(num1).padStart(4, "0")}`,
      passType: "CUSTOMER_DELIVERY",
      status: "CASHIER_REVIEW",
      vehicle: "WBA3A5C56CF256523",
      chassis: "WBAA12345TEST0001",
      paymentType: "IMMEDIATE",
      hasImmediate: true,
      cashierCleared: false,
      hasCredit: false,
      fromLocation: "Malmi Showroom",
      toLocation: null,
      createdById: initiator.id,
    },
  });
  console.log(`✅ Created ${gp1.gatePassNumber} — CASHIER_REVIEW (immediate) → appears in Cashier > Customer Delivery tab`);

  // ── Test Case 2: CREDIT payment → goes to Approver ───────────────────────
  const last2 = await prisma.gatePass.findFirst({ orderBy: { gatePassNumber: "desc" } });
  const num2 = last2 ? parseInt(last2.gatePassNumber.replace(/^GP-/, ""), 10) + 1 : 1;
  const gp2 = await (prisma.gatePass as any).create({
    data: {
      gatePassNumber: `GP-${String(num2).padStart(4, "0")}`,
      passType: "CUSTOMER_DELIVERY",
      status: "PENDING_APPROVAL",
      vehicle: "NCB-5599",
      chassis: "WBAA12345TEST0002",
      paymentType: "CREDIT",
      hasCredit: true,
      creditApproved: false,
      hasImmediate: false,
      cashierCleared: true,
      fromLocation: "Malmi Showroom",
      toLocation: null,
      createdById: initiator.id,
    },
  });
  console.log(`✅ Created ${gp2.gatePassNumber} — PENDING_APPROVAL (credit) → appears in Approver > Customer Delivery tab`);

  console.log("\n📋 Test steps:");
  console.log("  1. Login as cashier@dimo.lk → Order Review → Customer Delivery tab → see", gp1.gatePassNumber);
  console.log("  2. Click 'Confirm Payment Cleared' → status → APPROVED → Security gets notification");
  console.log("  3. Login as approver@dimo.lk → Pending Requests → Customer Delivery tab → see", gp2.gatePassNumber);
  console.log("  4. Open pass → Approve → status → APPROVED → Security gets notification");
}

main().catch(console.error).finally(() => prisma.$disconnect());
