import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hash(pw, 12);

  const users = [
    { name: "Admin", email: "admin@dimo.lk", passwordHash: await hash("Admin@2026"), role: "ADMIN" as const },
    { name: "John Perera", email: "initiator@dimo.lk", passwordHash: await hash("password123"), role: "INITIATOR" as const },
    { name: "Suresh Fernando", email: "approver@dimo.lk", passwordHash: await hash("password123"), role: "APPROVER" as const },
    { name: "Kasun Wijesekara", email: "approver2@dimo.lk", passwordHash: await hash("password123"), role: "APPROVER" as const },
    { name: "Amila Gunawardena", email: "approver3@dimo.lk", passwordHash: await hash("password123"), role: "APPROVER" as const },
    { name: "City Motors", email: "recipient@dimo.lk", passwordHash: await hash("password123"), role: "RECIPIENT" as const },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role },
      create: user,
    });
    console.log("Upserted: " + user.email + " (" + user.role + ")");
  }

  const requestedBy = [
    "Malmi",
    "Nuwan Perera",
    "Tharindu Silva",
    "Shenali Fernando",
    "Udara Jayasinghe",
  ];

  await prisma.requestedByOption.createMany({
    data: requestedBy.map((name) => ({ name })),
    skipDuplicates: true,
  });

  const outReasons = [
    "Sale",
    "Repair",
    "Demo",
    "Transfer",
    "Promo Location",
    "Financial Institute",
    "Insurance Evaluation",
    "Other",
  ];

  await prisma.outReasonOption.createMany({
    data: outReasons.map((value) => ({ value })),
    skipDuplicates: true,
  });

  const vehicles = [
    { vehicleNo: "CAA-4589", chassisNo: "MAT123450001", description: "TATA Xenon" },
    { vehicleNo: "CBF-9321", chassisNo: "MBL908120077", description: "Mercedes Actros" },
    { vehicleNo: "NC-7722", chassisNo: "XTR776610999", description: "Demo Unit" },
    { vehicleNo: "WP-KT-8890", chassisNo: "DIMO11082001", description: "Spare Unit" },
    { vehicleNo: "QH-1147", chassisNo: "DIMO11370045", description: "Dealer Delivery" },
  ];

  await prisma.vehicleOption.createMany({
    data: vehicles,
    skipDuplicates: true,
  });

  const locations = [
    ["1101", "Colombo TATA", "S104", "Altair Showroom"],
    ["1102", "Siyambalape CMD", "S105", "Vehicle Park"],
    ["1106", "Mercedes Centre 800", "S106", "DIMO 800"],
    ["1106", "Mercedes Centre 800", "S107", "TATA Nagar"],
    ["1108", "Weliweriya DM Logistics", "D001", "NISHADHI MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D002", "NALEEN ENTERPRIS"],
    ["1108", "Weliweriya DM Logistics", "D003", "CHANDANA ENTERPR"],
    ["1108", "Weliweriya DM Logistics", "D004", "SSH MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D005", "RANLANKA SUDESH"],
    ["1108", "Weliweriya DM Logistics", "D006", "SUN AUTO MART"],
    ["1108", "Weliweriya DM Logistics", "D007", "DHAMMIKA MOTOR"],
    ["1108", "Weliweriya DM Logistics", "D008", "ATHULA ENTERPRIS"],
    ["1108", "Weliweriya DM Logistics", "D009", "RENUKA MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D010", "ROHANA DISTRIBUT"],
    ["1108", "Weliweriya DM Logistics", "D011", "THENNAKOON MOTOR"],
    ["1108", "Weliweriya DM Logistics", "D012", "SILUMINA TRACTO"],
    ["1108", "Weliweriya DM Logistics", "D013", "S G ENTERPRISES"],
    ["1108", "Weliweriya DM Logistics", "D014", "JAYASUNDARA MOTO"],
    ["1108", "Weliweriya DM Logistics", "D015", "MANOJ ELECTRICAL"],
    ["1108", "Weliweriya DM Logistics", "D016", "ANURA LANKA"],
    ["1108", "Weliweriya DM Logistics", "D017", "KURUPPUARACHCHI"],
    ["1108", "Weliweriya DM Logistics", "D018", "NEW SUPER STEEL"],
    ["1108", "Weliweriya DM Logistics", "D019", "R D MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D020", "RUWAN MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D021", "SJS NORTHERN GRO"],
    ["1108", "Weliweriya DM Logistics", "D022", "DULANA GOVISELA"],
    ["1108", "Weliweriya DM Logistics", "D023", "PABASARA AGRO"],
    ["1108", "Weliweriya DM Logistics", "D024", "MANJULA MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D025", "A T I ENTERPRISE"],
    ["1108", "Weliweriya DM Logistics", "D026", "ONE DAN TRADERS"],
    ["1108", "Weliweriya DM Logistics", "D027", "KASUN MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D028", "NEW LAKPRIYA MOT"],
    ["1108", "Weliweriya DM Logistics", "D030", "WARDHANA TRADE"],
    ["1108", "Weliweriya DM Logistics", "D031", "J N ENGINEERING"],
    ["1108", "Weliweriya DM Logistics", "D032", "BHATHIYA MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D033", "PRIYANKA MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D034", "PIYAL AUTO ENGIN"],
    ["1108", "Weliweriya DM Logistics", "D035", "KAVIN MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D036", "SANUKA ENTERPRIS"],
    ["1108", "Weliweriya DM Logistics", "D037", "KAVINDU ENTERPRI"],
    ["1108", "Weliweriya DM Logistics", "D038", "NDP MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D039", "N A S MOTORS"],
    ["1108", "Weliweriya DM Logistics", "D040", "UPALI MOTORS &"],
    ["1108", "Weliweriya DM Logistics", "D041", "SOMAK ENTERPRISE"],
    ["1108", "Weliweriya DM Logistics", "D042", "AMARASIRI AGRO"],
    ["1108", "Weliweriya DM Logistics", "D043", "4 WHEEL TRADE CT"],
    ["1108", "Weliweriya DM Logistics", "D044", "EVIN MOTERS"],
    ["1108", "Weliweriya DM Logistics", "D045", "BANDULA HARDWARE"],
    ["1108", "Weliweriya DM Logistics", "D046", "DAHAM LANKA ENTE"],
    ["1108", "Weliweriya DM Logistics", "D047", "A V P MOTORS"],
    ["1108", "Weliweriya DM Logistics", "S110", "Vehicle Park-1"],
    ["1108", "Weliweriya DM Logistics", "S111", "Dealer Location"],
    ["1108", "Weliweriya DM Logistics", "S112", "Promo Location"],
    ["1108", "Weliweriya DM Logistics", "S113", "Finan Institute"],
    ["1110", "Siyambalape Service Complex", "S109", "Vehicle Park"],
    ["1110", "Siyambalape Service Complex", "S113", "Vehicle Park"],
    ["1114", "Yakkala Branch", "S102", "Vehicle Park-1"],
    ["1114", "Yakkala Branch", "S103", "Promo Location"],
    ["1115", "Kuruwita Branch", "S103", "Vehicle Park-1"],
    ["1115", "Kuruwita Branch", "S105", "Promo Location"],
    ["1115", "Kuruwita Branch", "S106", "Finan Institute"],
    ["1116", "Embilipitiya Branch", "S102", "Vehicle Park-1"],
    ["1116", "Embilipitiya Branch", "S104", "Oil Store"],
    ["1116", "Embilipitiya Branch", "S105", "Promo Location"],
    ["1116", "Embilipitiya Branch", "S106", "Finan Institute"],
    ["1118", "Trincomalee Branch", "S104", "Vehicle Park-1"],
    ["1118", "Trincomalee Branch", "S105", "Promo Location"],
    ["1118", "Trincomalee Branch", "S106", "Finan Institute"],
    ["1119", "Batticoloa Branch", "S103", "Vehicle Park-1"],
    ["1119", "Batticoloa Branch", "S105", "Promo Location"],
    ["1119", "Batticoloa Branch", "S106", "Finan Institute"],
    ["1120", "Anuradhapura Branch", "S103", "Vehicle Park-1"],
    ["1120", "Anuradhapura Branch", "S110", "Promo Location"],
    ["1120", "Anuradhapura Branch", "S111", "Finan Institute"],
    ["1122", "Kurunegala Regional Centere", "S105", "Vehicle Park-1"],
    ["1122", "Kurunegala Regional Centere", "S107", "Promo Location"],
    ["1122", "Kurunegala Regional Centere", "S108", "Finan Institute"],
    ["1124", "Marawila Branch", "S103", "Vehicle Park-1"],
    ["1124", "Marawila Branch", "S105", "Promo Location"],
    ["1124", "Marawila Branch", "S106", "Finan Institute"],
    ["1126", "Kandy Branch", "S102", "Vehicle Park-1"],
    ["1126", "Kandy Branch", "S103", "Promo Location"],
    ["1126", "Kandy Branch", "S104", "Finan Institute"],
    ["1127", "Dambulla Branch", "S101", "Vehicle Park-1"],
    ["1127", "Dambulla Branch", "S102", "Promo Location"],
    ["1127", "Dambulla Branch", "S103", "Finan Institute"],
    ["1128", "Mahiyangana Branch", "S102", "Vehicle Park-1"],
    ["1128", "Mahiyangana Branch", "S105", "Promo Location"],
    ["1128", "Mahiyangana Branch", "S106", "Finan Institute"],
    ["1130", "Jaffna Branch", "S105", "Vehicle Park-1"],
    ["1130", "Jaffna Branch", "S107", "Promo Location"],
    ["1130", "Jaffna Branch", "S108", "Finan Institute"],
    ["1131", "Vavuniya Branch", "S103", "Vehicle Park-1"],
    ["1131", "Vavuniya Branch", "S105", "Promo Location"],
    ["1131", "Vavuniya Branch", "S106", "Finan Institute"],
    ["1132", "Mathugama Branch", "S103", "Vehicle Park-1"],
    ["1132", "Mathugama Branch", "S105", "Promo Location"],
    ["1132", "Mathugama Branch", "S106", "Finan Institute"],
    ["1133", "Galle Branch", "S101", "Vehicle Park-1"],
    ["1133", "Galle Branch", "S102", "TATA Parts"],
    ["1133", "Galle Branch", "S103", "Promo Location"],
    ["1133", "Galle Branch", "S104", "Finan Institute"],
    ["1134", "Matara Branch", "S103", "Vehicle Park-1"],
    ["1134", "Matara Branch", "S107", "Promo Location"],
    ["1134", "Matara Branch", "S108", "Finan Institute"],
    ["1135", "Tissamaharama Branch", "S104", "Vehicle Park-1"],
    ["1135", "Tissamaharama Branch", "S105", "Promo Location"],
    ["1135", "Tissamaharama Branch", "S106", "Finan Institute"],
    ["1137", "Luxary Buses Sales_Weliweriya", "S103", "Promo Location"],
    ["1137", "Luxary Buses Sales_Weliweriya", "S104", "Financial Instit"],
  ] as const;

  await prisma.locationOption.createMany({
    data: locations.map(([plantCode, plantDescription, storageLocation, storageDescription]) => ({
      plantCode,
      plantDescription,
      storageLocation,
      storageDescription,
    })),
    skipDuplicates: true,
  });

  console.log("\nadmin@dimo.lk / Admin@2026");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
