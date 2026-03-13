/**
 * Seed real SAP location data
 * Run: npx tsx prisma/seed-locations.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// locationType based on Sloc prefix + description
function getLT(sloc: string, desc: string): string {
  if (sloc.startsWith("D")) return "DEALER";
  if (desc === "Promo Location") return "PROMOTION";
  if (desc === "Finan Institute" || desc === "Financial Instit") return "FINANCE";
  return "DIMO";
}

// [plantCode, plantDescription, storageLocation, storageDescription]
type Row = [string, string, string, string];

const LOCATIONS: Row[] = [
  // ── Colombo TATA ────────────────────────────────────────────────────
  ["COLTATA", "Colombo TATA", "S104", "Altair Showroom"],

  // ── Siyambalape CMD ─────────────────────────────────────────────────
  ["SIMCMD", "Siyambalape CMD", "S105", "Vehicle Park"],

  // ── Mercedes Centre 800 ─────────────────────────────────────────────
  ["MB800", "Mercedes Centre 800", "S106", "DIMO 800"],
  ["MB800", "Mercedes Centre 800", "S107", "TATA Nagar"],

  // ── Weliweriya DM Logistics — DEALER (D prefix) ─────────────────────
  ["WLWDML", "Weliweriya DM Logistics", "D001", "NISHADHI MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D002", "NALEEN ENTERPRIS"],
  ["WLWDML", "Weliweriya DM Logistics", "D003", "CHANDANA ENTERPR"],
  ["WLWDML", "Weliweriya DM Logistics", "D004", "SSH MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D005", "RANLANKA SUDESH"],
  ["WLWDML", "Weliweriya DM Logistics", "D006", "SUN AUTO MART"],
  ["WLWDML", "Weliweriya DM Logistics", "D007", "DHAMMIKA MOTOR"],
  ["WLWDML", "Weliweriya DM Logistics", "D008", "ATHULA ENTERPRIS"],
  ["WLWDML", "Weliweriya DM Logistics", "D009", "RENUKA MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D010", "ROHANA DISTRIBUT"],
  ["WLWDML", "Weliweriya DM Logistics", "D011", "THENNAKOON MOTOR"],
  ["WLWDML", "Weliweriya DM Logistics", "D012", "SILUMINA TRACTO"],
  ["WLWDML", "Weliweriya DM Logistics", "D013", "S G ENTERPRISES"],
  ["WLWDML", "Weliweriya DM Logistics", "D014", "JAYASUNDARA MOTO"],
  ["WLWDML", "Weliweriya DM Logistics", "D015", "MANOJ ELECTRICAL"],
  ["WLWDML", "Weliweriya DM Logistics", "D016", "ANURA LANKA"],
  ["WLWDML", "Weliweriya DM Logistics", "D017", "KURUPPUARACHCHI"],
  ["WLWDML", "Weliweriya DM Logistics", "D018", "NEW SUPER STEEL"],
  ["WLWDML", "Weliweriya DM Logistics", "D019", "R D MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D020", "RUWAN MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D021", "SJS NORTHERN GRO"],
  ["WLWDML", "Weliweriya DM Logistics", "D022", "DULANA GOVISELA"],
  ["WLWDML", "Weliweriya DM Logistics", "D023", "PABASARA AGRO"],
  ["WLWDML", "Weliweriya DM Logistics", "D024", "MANJULA MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D025", "A T I ENTERPRISE"],
  ["WLWDML", "Weliweriya DM Logistics", "D026", "ONE DAN TRADERS"],
  ["WLWDML", "Weliweriya DM Logistics", "D027", "KASUN MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D028", "NEW LAKPRIYA MOT"],
  ["WLWDML", "Weliweriya DM Logistics", "D030", "WARDHANA TRADE"],
  ["WLWDML", "Weliweriya DM Logistics", "D031", "J N ENGINEERING"],
  ["WLWDML", "Weliweriya DM Logistics", "D032", "BHATHIYA MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D033", "PRIYANKA MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D034", "PIYAL AUTO ENGIN"],
  ["WLWDML", "Weliweriya DM Logistics", "D035", "KAVIN MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D036", "SANUKA ENTERPRIS"],
  ["WLWDML", "Weliweriya DM Logistics", "D037", "KAVINDU ENTERPRI"],
  ["WLWDML", "Weliweriya DM Logistics", "D038", "NDP MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D039", "N A S MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D040", "UPALI MOTORS"],
  ["WLWDML", "Weliweriya DM Logistics", "D041", "SOMAK ENTERPRISE"],
  ["WLWDML", "Weliweriya DM Logistics", "D042", "AMARASIRI AGRO"],
  ["WLWDML", "Weliweriya DM Logistics", "D043", "4 WHEEL TRADE CT"],
  ["WLWDML", "Weliweriya DM Logistics", "D044", "EVIN MOTERS"],
  ["WLWDML", "Weliweriya DM Logistics", "D045", "BANDULA HARDWARE"],
  ["WLWDML", "Weliweriya DM Logistics", "D046", "DAHAM LANKA ENTE"],
  ["WLWDML", "Weliweriya DM Logistics", "D047", "A V P MOTORS"],
  // Weliweriya DM Logistics — DIMO/Promo/Finance (S prefix)
  ["WLWDML", "Weliweriya DM Logistics", "S110", "Vehicle Park-1"],
  ["WLWDML", "Weliweriya DM Logistics", "S111", "Dealer Location"],
  ["WLWDML", "Weliweriya DM Logistics", "S112", "Promo Location"],
  ["WLWDML", "Weliweriya DM Logistics", "S113", "Finan Institute"],

  // ── Siyambalape Service Complex ─────────────────────────────────────
  ["SIMSC", "Siyambalape Service Complex", "S109", "Vehicle Park"],
  ["SIMSC", "Siyambalape Service Complex", "S113", "Vehicle Park"],

  // ── Yakkala Branch ──────────────────────────────────────────────────
  ["YKKL", "Yakkala Branch", "S102", "Vehicle Park-1"],
  ["YKKL", "Yakkala Branch", "S103", "Promo Location"],

  // ── Kuruwita Branch ─────────────────────────────────────────────────
  ["KURW", "Kuruwita Branch", "S103", "Vehicle Park-1"],
  ["KURW", "Kuruwita Branch", "S105", "Promo Location"],
  ["KURW", "Kuruwita Branch", "S106", "Finan Institute"],

  // ── Embilipitiya Branch ─────────────────────────────────────────────
  ["EMBL", "Embilipitiya Branch", "S102", "Vehicle Park-1"],
  ["EMBL", "Embilipitiya Branch", "S104", "Oil Store"],
  ["EMBL", "Embilipitiya Branch", "S105", "Promo Location"],
  ["EMBL", "Embilipitiya Branch", "S106", "Finan Institute"],

  // ── Trincomalee Branch ──────────────────────────────────────────────
  ["TRNC", "Trincomalee Branch", "S104", "Vehicle Park-1"],
  ["TRNC", "Trincomalee Branch", "S105", "Promo Location"],
  ["TRNC", "Trincomalee Branch", "S106", "Finan Institute"],

  // ── Batticoloa Branch ───────────────────────────────────────────────
  ["BATT", "Batticoloa Branch", "S103", "Vehicle Park-1"],
  ["BATT", "Batticoloa Branch", "S105", "Promo Location"],
  ["BATT", "Batticoloa Branch", "S106", "Finan Institute"],

  // ── Anuradhapura Branch ─────────────────────────────────────────────
  ["ANRD", "Anuradhapura Branch", "S103", "Vehicle Park-1"],
  ["ANRD", "Anuradhapura Branch", "S110", "Promo Location"],
  ["ANRD", "Anuradhapura Branch", "S111", "Finan Institute"],

  // ── Kurunegala Regional Centre ──────────────────────────────────────
  ["KURN", "Kurunegala Regional Centre", "S105", "Vehicle Park-1"],
  ["KURN", "Kurunegala Regional Centre", "S107", "Promo Location"],
  ["KURN", "Kurunegala Regional Centre", "S108", "Finan Institute"],

  // ── Marawila Branch ─────────────────────────────────────────────────
  ["MARW", "Marawila Branch", "S103", "Vehicle Park-1"],
  ["MARW", "Marawila Branch", "S105", "Promo Location"],
  ["MARW", "Marawila Branch", "S106", "Finan Institute"],

  // ── Kandy Branch ────────────────────────────────────────────────────
  ["KNDY", "Kandy Branch", "S102", "Vehicle Park-1"],
  ["KNDY", "Kandy Branch", "S103", "Promo Location"],
  ["KNDY", "Kandy Branch", "S104", "Finan Institute"],

  // ── Dambulla Branch ─────────────────────────────────────────────────
  ["DMBL", "Dambulla Branch", "S101", "Vehicle Park-1"],
  ["DMBL", "Dambulla Branch", "S102", "Promo Location"],
  ["DMBL", "Dambulla Branch", "S103", "Finan Institute"],

  // ── Mahiyangana Branch ──────────────────────────────────────────────
  ["MHYG", "Mahiyangana Branch", "S102", "Vehicle Park-1"],
  ["MHYG", "Mahiyangana Branch", "S105", "Promo Location"],
  ["MHYG", "Mahiyangana Branch", "S106", "Finan Institute"],

  // ── Jaffna Branch ───────────────────────────────────────────────────
  ["JFNA", "Jaffna Branch", "S105", "Vehicle Park-1"],
  ["JFNA", "Jaffna Branch", "S107", "Promo Location"],
  ["JFNA", "Jaffna Branch", "S108", "Finan Institute"],

  // ── Vavuniya Branch ─────────────────────────────────────────────────
  ["VAVN", "Vavuniya Branch", "S103", "Vehicle Park-1"],
  ["VAVN", "Vavuniya Branch", "S105", "Promo Location"],
  ["VAVN", "Vavuniya Branch", "S106", "Finan Institute"],

  // ── Mathugama Branch ────────────────────────────────────────────────
  ["MTGM", "Mathugama Branch", "S103", "Vehicle Park-1"],
  ["MTGM", "Mathugama Branch", "S105", "Promo Location"],
  ["MTGM", "Mathugama Branch", "S106", "Finan Institute"],

  // ── Galle Branch ────────────────────────────────────────────────────
  ["GALL", "Galle Branch", "S101", "Vehicle Park-1"],
  ["GALL", "Galle Branch", "S102", "TATA Parts"],
  ["GALL", "Galle Branch", "S103", "Promo Location"],
  ["GALL", "Galle Branch", "S104", "Finan Institute"],

  // ── Matara Branch ───────────────────────────────────────────────────
  ["MTAR", "Matara Branch", "S103", "Vehicle Park-1"],
  ["MTAR", "Matara Branch", "S107", "Promo Location"],
  ["MTAR", "Matara Branch", "S108", "Finan Institute"],

  // ── Tissamaharama Branch ────────────────────────────────────────────
  ["TSSM", "Tissamaharama Branch", "S104", "Vehicle Park-1"],
  ["TSSM", "Tissamaharama Branch", "S105", "Promo Location"],
  ["TSSM", "Tissamaharama Branch", "S106", "Finan Institute"],

  // ── Luxary Buses Sales Weliweriya ───────────────────────────────────
  ["LBSW", "Luxary Buses Sales-Weliweriya", "S103", "Promo Location"],
  ["LBSW", "Luxary Buses Sales-Weliweriya", "S104", "Financial Instit"],
];

async function main() {
  console.log("🌱 Seeding real location data...\n");

  // Clear old dummy locations
  await prisma.locationOption.deleteMany({});
  console.log("  ✓ Cleared old location options");

  let count = 0;
  for (const [plantCode, plantDescription, storageLocation, storageDescription] of LOCATIONS) {
    const locationType = getLT(storageLocation, storageDescription);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.locationOption as any).upsert({
      where: { plantCode_storageLocation: { plantCode, storageLocation } },
      update: { plantDescription, storageDescription, locationType },
      create: { plantCode, plantDescription, storageLocation, storageDescription, locationType },
    });
    count++;
  }

  console.log(`✓ ${count} location options seeded\n`);
  console.log("Location type breakdown:");
  const all = await prisma.locationOption.findMany({ select: { storageLocation: true } });
  const dCount = all.filter(r => r.storageLocation.startsWith("D")).length;
  const sCount = all.filter(r => r.storageLocation.startsWith("S")).length;
  console.log(`  DEALER (D prefix): ${dCount}`);
  console.log(`  DIMO/Promo/Finance (S prefix): ${sCount}`);
  console.log("\n✅ Done!");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
