/**
 * One-time seed for AdminLocationCache — the DB-backed source for the Admin "Select
 * Locations" / "Mapped Plants" picker (see lib/admin-locations.ts). Run this once per
 * environment so the picker works immediately, without waiting on a SAP refresh:
 *
 *   npx tsx scripts/seed-admin-location-cache.ts
 *
 * Safe to re-run — upserts by (plantDescription, storageDescription), never duplicates.
 * Does NOT touch LocationOption, SAP, or any Location Transfer / Customer Delivery data.
 */
import { prisma } from "../lib/prisma";

const LOCATIONS: string[] = [
  "Colombo TATA - Altair Showroom",
  "Anuradhapura Branch - Diesel PumpParts",
  "Anuradhapura Branch - Finan Institute",
  "Anuradhapura Branch - Oil Store",
  "Anuradhapura Branch - Paint Store",
  "Anuradhapura Branch - Promo Location",
  "Anuradhapura Branch - Tata Bodyparts",
  "Anuradhapura Branch - TATA Parts",
  "Anuradhapura Branch - Vehicle Park-1",
  "Batticoloa Branch - Administration",
  "Batticoloa Branch - Finan Institute",
  "Batticoloa Branch - Oil Store",
  "Batticoloa Branch - Promo Location",
  "Batticoloa Branch - TATA Parts",
  "Batticoloa Branch - Vehicle Park-1",
  "Batticoloa Branch - VOR Purchasing",
  "Colombo TATA - Fuel Store",
  "Colombo TATA - Head Office",
  "Colombo TATA - HO Staff CarPark",
  "Colombo TATA - Retail Display",
  "Colombo TATA - TATA Parts",
  "Colombo TATA - Tata PVPt Altair",
  "Colombo TATA - Transit-SLPA",
  "Embilipitiya Branch - Administration",
  "Embilipitiya Branch - Finan Institute",
  "Embilipitiya Branch - Oil Store",
  "Embilipitiya Branch - Promo Location",
  "Embilipitiya Branch - TATA Parts",
  "Embilipitiya Branch - Vehicle Park-1",
  "Embilipitiya Branch - VOR Purchasing",
  "Galle Branch - Administration",
  "Galle Branch - Finan Institute",
  "Galle Branch - Promo Location",
  "Galle Branch - TATA Parts",
  "Galle Branch - Vehicle Park-1",
  "Galle Branch - VOR Purchasing",
  "Jaffna Branch - Administration",
  "Jaffna Branch - Finan Institute",
  "Jaffna Branch - Oil Store",
  "Jaffna Branch - Promo Location",
  "Jaffna Branch - TATA Body Shop",
  "Jaffna Branch - TATA Paints",
  "Jaffna Branch - TATA Parts",
  "Jaffna Branch - Vehicle Park-1",
  "Jaffna Branch - VOR Purchasing",
  "Kandy Branch - Administration",
  "Kandy Branch - Finan Institute",
  "Kandy Branch - Promo Location",
  "Kandy Branch - TATA Parts",
  "Kandy Branch - Vehicle Park-1",
  "Kandy Branch - VOR Purchasing",
  "Kurunegala Regional Centere - Administration",
  "Kurunegala Regional Centere - Oil Store",
  "Kurunegala Regional Centere - Paint Store",
  "Kurunegala Regional Centere - PC 5132 Disl Lab",
  "Kurunegala Regional Centere - Promo Location",
  "Kurunegala Regional Centere - SPOT PO",
  "Kurunegala Regional Centere - TATA Parts",
  "Kurunegala Regional Centere - Tools Store",
  "Kurunegala Regional Centere - Vehicle Park-1",
  "Kurunegala Regional Centere - VOR Purchasing",
  "Kuruwita Branch - Administration",
  "Kuruwita Branch - Finan Institute",
  "Kuruwita Branch - Oil Store",
  "Kuruwita Branch - Promo Location",
  "Kuruwita Branch - TATA Parts",
  "Kuruwita Branch - Vehicle Park-1",
  "Kuruwita Branch - VOR Purchasing",
  "Matara Branch - Administration",
  "Matara Branch - Finan Institute",
  "Matara Branch - Oil Store",
  "Matara Branch - Paint Store",
  "Matara Branch - Promo Location",
  "Matara Branch - Tata Body Parts",
  "Matara Branch - TATA Parts",
  "Matara Branch - Tools Store",
  "Matara Branch - Vehicle Park-1",
  "Matara Branch - VOR Purchasing",
  "Mercedes Centre 800 - 800 Spares",
  "Mercedes Centre 800 - Administration",
  "Mercedes Centre 800 - Defects",
  "Mercedes Centre 800 - DIMO 800",
  "Mercedes Centre 800 - DISPLAY - Acces",
  "Mercedes Centre 800 - Finan Institute",
  "Mercedes Centre 800 - Oil Store",
  "Mercedes Centre 800 - Paint Store",
  "Mercedes Centre 800 - Promo Location",
  "Mercedes Centre 800 - TATA Nagar",
  "Mercedes Centre 800 - Tools Store",
  "Mercedes Centre 800 - Transit-SLPA",
  "Mercedes Centre 800 - VOR Purchasing",
  "PRJ DM-Renewable Energy - PRJ-Ren. Energy",
  "Siyambalape CMD - CMD spare parts",
  "Siyambalape CMD - Cons M/C Parking",
  "Weliweriya DM Logistics - Agri Implements",
  "Weliweriya DM Logistics - Cons M/C Parking",
  "Weliweriya DM Logistics - MHE Proj Spares",
  "Weliweriya DM Logistics - Vehicle Park-1",
];

async function main() {
  let count = 0;
  for (const line of LOCATIONS) {
    const idx = line.indexOf(" - ");
    if (idx === -1) continue;
    const plantDescription = line.slice(0, idx).trim();
    const storageDescription = line.slice(idx + 3).trim();
    if (!plantDescription || !storageDescription) continue;

    await prisma.adminLocationCache.upsert({
      where: { plantDescription_storageDescription: { plantDescription, storageDescription } },
      update: {},
      create: { plantDescription, storageDescription },
    });
    count++;
  }
  console.log(`Seeded/verified ${count} admin location rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
