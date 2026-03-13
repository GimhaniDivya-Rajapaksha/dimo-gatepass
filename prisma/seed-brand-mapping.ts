/**
 * Seed Location_Brand_Mapping from Excel data
 * Run: npx tsx prisma/seed-brand-mapping.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// [location, brand, initiatorName, approverName]
type Row = [string, string, string, string];

const MAPPINGS: Row[] = [
  ["Colombo",      "Toyota",  "Nimal Perera",       "Ruwan Silva"],
  ["Colombo",      "Nissan",  "Nimal Perera",       "Ruwan Silva"],
  ["Colombo",      "Suzuki",  "Nimal Perera",       "Ruwan Silva"],
  ["Gampaha",      "Toyota",  "Kasun Fernando",     "Ruwan Silva"],
  ["Gampaha",      "Honda",   "Kasun Fernando",     "Ruwan Silva"],
  ["Negombo",      "Nissan",  "Shehan Dias",        "Ruwan Silva"],
  ["Negombo",      "Mazda",   "Shehan Dias",        "Ruwan Silva"],
  ["Kandy",        "Toyota",  "Malith Senanayake",  "Anura Jayasinghe"],
  ["Kandy",        "Nissan",  "Malith Senanayake",  "Anura Jayasinghe"],
  ["Kandy",        "BMW",     "Malith Senanayake",  "Anura Jayasinghe"],
  ["Kurunegala",   "Suzuki",  "Tharindu Lakmal",    "Anura Jayasinghe"],
  ["Kurunegala",   "Toyota",  "Tharindu Lakmal",    "Anura Jayasinghe"],
  ["Matara",       "Honda",   "Dilan Perera",       "Chathura Wijeratne"],
  ["Matara",       "Toyota",  "Dilan Perera",       "Chathura Wijeratne"],
  ["Galle",        "Nissan",  "Sanduni Silva",      "Chathura Wijeratne"],
  ["Galle",        "Suzuki",  "Sanduni Silva",      "Chathura Wijeratne"],
  ["Anuradhapura", "Toyota",  "Ishara Madushan",    "Ruwan Silva"],
  ["Anuradhapura", "Isuzu",   "Ishara Madushan",    "Ruwan Silva"],
  ["Jaffna",       "Nissan",  "Thilina Rajapaksha", "Anura Jayasinghe"],
  ["Jaffna",       "Toyota",  "Thilina Rajapaksha", "Anura Jayasinghe"],
  ["Batticaloa",   "Suzuki",  "Rashmi Fernando",    "Chathura Wijeratne"],
  ["Batticaloa",   "Honda",   "Rashmi Fernando",    "Chathura Wijeratne"],
  ["Ratnapura",    "Toyota",  "Sajith Perera",      "Ruwan Silva"],
  ["Ratnapura",    "Nissan",  "Sajith Perera",      "Ruwan Silva"],
  ["Badulla",      "Mazda",   "Chamara Lakshan",    "Anura Jayasinghe"],
  ["Badulla",      "Toyota",  "Chamara Lakshan",    "Anura Jayasinghe"],
];

async function main() {
  console.log("🌱 Seeding Location_Brand_Mapping data...\n");

  let created = 0;
  for (const [location, brand, initiatorName, approverName] of MAPPINGS) {
    await prisma.$executeRaw`
      INSERT INTO "LocationBrandMapping" ("id","location","brand","initiatorName","approverName","createdAt")
      VALUES (gen_random_uuid(), ${location}, ${brand}, ${initiatorName}, ${approverName}, NOW())
      ON CONFLICT ("location","brand") DO UPDATE
        SET "initiatorName" = EXCLUDED."initiatorName",
            "approverName"  = EXCLUDED."approverName"
    `;
    created++;
    console.log(`  ✓ ${location} / ${brand} → ${initiatorName} (${approverName})`);
  }

  console.log(`\n✅ ${created} brand mappings seeded`);
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
