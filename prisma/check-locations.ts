import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  // Get a sample of locations grouped by plant
  const rows = await p.locationOption.findMany({
    take: 40,
    orderBy: { plantCode: "asc" },
    distinct: ["plantCode"],
    select: { plantCode: true, plantDescription: true, storageDescription: true, locationType: true },
  });
  console.log("\n=== LOCATIONS (distinct plantCode) ===");
  rows.forEach(r => console.log(`${(r.locationType ?? "NULL").padEnd(10)} | ${r.plantCode} | ${r.plantDescription} - ${r.storageDescription}`));

  // Get brands
  const brands = await p.user.findMany({ where: { brand: { not: null } }, select: { brand: true }, distinct: ["brand"] });
  console.log("\n=== EXISTING BRANDS on users ===");
  brands.forEach(b => console.log(b.brand));
}

main().catch(console.error).finally(() => p.$disconnect());
