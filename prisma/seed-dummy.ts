/**
 * Seed dummy data from location_brand_initiator_approver_dummy.xlsx
 * Run: npx tsx prisma/seed-dummy.ts
 * (stop dev server first, then run: npx prisma generate)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LOCATION_CODES: Record<string, string> = {
  Colombo: "COL",
  Gampaha: "GAM",
  Negombo: "NEG",
  Kandy: "KAN",
  Kurunegala: "KUR",
  Matara: "MAT",
  Galle: "GAL",
  Anuradhapura: "ANU",
  Jaffna: "JAF",
  Batticaloa: "BAT",
  Ratnapura: "RAT",
  Badulla: "BAD",
};

const DEALER_LOCATIONS = Object.entries(LOCATION_CODES).map(([city, code]) => ({
  plantCode: code,
  plantDescription: `DIMO ${city}`,
  storageLocation: `${code}-001`,
  storageDescription: city,
  locationType: "DEALER",
}));

// Extra DIMO (head office) locations
const DIMO_LOCATIONS = [
  { plantCode: "HO", plantDescription: "DIMO Head Office", storageLocation: "HO-001", storageDescription: "Head Office - Colombo 03", locationType: "DIMO" },
  { plantCode: "HO", plantDescription: "DIMO Head Office", storageLocation: "HO-002", storageDescription: "Warehouse A", locationType: "DIMO" },
  { plantCode: "HO", plantDescription: "DIMO Head Office", storageLocation: "HO-003", storageDescription: "Warehouse B", locationType: "DIMO" },
  { plantCode: "WH", plantDescription: "DIMO Wattala", storageLocation: "WH-001", storageDescription: "Wattala Service Centre", locationType: "DIMO" },
];

// Promotion locations
const PROMOTION_LOCATIONS = [
  { plantCode: "EX", plantDescription: "Exhibition", storageLocation: "EX-001", storageDescription: "Colombo Motor Show", locationType: "PROMOTION" },
  { plantCode: "EX", plantDescription: "Exhibition", storageLocation: "EX-002", storageDescription: "Kandy Showroom Promo", locationType: "PROMOTION" },
];

// Finance locations
const FINANCE_LOCATIONS = [
  { plantCode: "FI", plantDescription: "Finance", storageLocation: "FI-001", storageDescription: "LOLC Finance", locationType: "FINANCE" },
  { plantCode: "FI", plantDescription: "Finance", storageLocation: "FI-002", storageDescription: "Commercial Bank Leasing", locationType: "FINANCE" },
  { plantCode: "FI", plantDescription: "Finance", storageLocation: "FI-003", storageDescription: "Peoples Leasing", locationType: "FINANCE" },
];

const OUT_REASONS = [
  "Transfer to Dealer",
  "Customer Delivery",
  "Repair / Service",
  "Demo Vehicle",
  "Trade-in Vehicle",
  "Test Drive",
  "Exhibition / Promotion",
  "Finance / Leasing Handover",
  "After Sales Return",
  "Internal Transfer",
];

// From Excel: 3 approvers, 12 initiators
const APPROVERS = [
  { name: "Ruwan Silva",       email: "ruwan.silva@dimo.lk" },
  { name: "Anura Jayasinghe",  email: "anura.jayasinghe@dimo.lk" },
  { name: "Chathura Wijeratne",email: "chathura.wijeratne@dimo.lk" },
];

const INITIATORS: { name: string; email: string; approverName: string }[] = [
  { name: "Nimal Perera",       email: "nimal.perera@dimo.lk",       approverName: "Ruwan Silva" },
  { name: "Kasun Fernando",     email: "kasun.fernando@dimo.lk",     approverName: "Ruwan Silva" },
  { name: "Shehan Dias",        email: "shehan.dias@dimo.lk",        approverName: "Ruwan Silva" },
  { name: "Malith Senanayake",  email: "malith.senanayake@dimo.lk",  approverName: "Anura Jayasinghe" },
  { name: "Tharindu Lakmal",    email: "tharindu.lakmal@dimo.lk",    approverName: "Anura Jayasinghe" },
  { name: "Dilan Perera",       email: "dilan.perera@dimo.lk",       approverName: "Chathura Wijeratne" },
  { name: "Sanduni Silva",      email: "sanduni.silva@dimo.lk",      approverName: "Chathura Wijeratne" },
  { name: "Ishara Madushan",    email: "ishara.madushan@dimo.lk",    approverName: "Ruwan Silva" },
  { name: "Thilina Rajapaksha", email: "thilina.rajapaksha@dimo.lk", approverName: "Anura Jayasinghe" },
  { name: "Rashmi Fernando",    email: "rashmi.fernando@dimo.lk",    approverName: "Chathura Wijeratne" },
  { name: "Sajith Perera",      email: "sajith.perera@dimo.lk",      approverName: "Ruwan Silva" },
  { name: "Chamara Lakshan",    email: "chamara.lakshan@dimo.lk",    approverName: "Anura Jayasinghe" },
];

async function main() {
  console.log("🌱 Seeding dummy data...\n");
  const pw = await bcrypt.hash("password123", 10);

  // ── 1. Locations ────────────────────────────────────────────────────
  const allLocations = [...DEALER_LOCATIONS, ...DIMO_LOCATIONS, ...PROMOTION_LOCATIONS, ...FINANCE_LOCATIONS];
  for (const loc of allLocations) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.locationOption as any).upsert({
      where: { plantCode_storageLocation: { plantCode: loc.plantCode, storageLocation: loc.storageLocation } },
      update: { locationType: loc.locationType, plantDescription: loc.plantDescription, storageDescription: loc.storageDescription },
      create: loc,
    });
  }
  console.log(`✓ ${allLocations.length} location options seeded`);

  // ── 2. Out Reasons ──────────────────────────────────────────────────
  for (const reason of OUT_REASONS) {
    await prisma.outReasonOption.upsert({
      where: { value: reason },
      update: {},
      create: { value: reason },
    });
  }
  console.log(`✓ ${OUT_REASONS.length} out reasons seeded`);

  // ── 3. Approvers ────────────────────────────────────────────────────
  const approverMap: Record<string, string> = {};
  for (const a of APPROVERS) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name, role: "APPROVER" },
      create: { name: a.name, email: a.email, passwordHash: pw, role: "APPROVER" },
    });
    approverMap[a.name] = user.id;
    console.log(`  ✓ Approver: ${a.name} (${a.email})`);
  }

  // ── 4. Initiators ───────────────────────────────────────────────────
  for (const ini of INITIATORS) {
    const approverId = approverMap[ini.approverName];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.user as any).upsert({
      where: { email: ini.email },
      update: { name: ini.name, role: "INITIATOR", approverId },
      create: { name: ini.name, email: ini.email, passwordHash: pw, role: "INITIATOR", approverId },
    });
    console.log(`  ✓ Initiator: ${ini.name} → ${ini.approverName}`);
  }

  console.log("\n✅ Seed complete!");
  console.log("\n📋 Login credentials (password: password123)");
  console.log("Approvers:");
  APPROVERS.forEach(a => console.log(`  ${a.email}`));
  console.log("Initiators:");
  INITIATORS.forEach(i => console.log(`  ${i.email}`));
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
