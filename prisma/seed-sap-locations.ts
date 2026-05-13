import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.locationOption.createMany({
    data: [
      { plantCode: "1108", plantDescription: "Weliweriya DM Logistics", storageLocation: "S105", storageDescription: "CMD & MHE Park" },
      { plantCode: "1108", plantDescription: "Weliweriya DM Logistics", storageLocation: "D001", storageDescription: "NISHADHI MOTORS" },
      { plantCode: "1108", plantDescription: "Weliweriya DM Logistics", storageLocation: "S118", storageDescription: "Finan.institute" },
      { plantCode: "1108", plantDescription: "Weliweriya DM Logistics", storageLocation: "S119", storageDescription: "Promo location" },
      { plantCode: "1106", plantDescription: "TATA Nagar", storageLocation: "S107", storageDescription: "TATA Nagar" },
      { plantCode: "1106", plantDescription: "DIMO 800", storageLocation: "S106", storageDescription: "DIMO 800" },
      { plantCode: "2003", plantDescription: "Luxary Buses Sales_Weliweriya", storageLocation: "S102", storageDescription: "Vehicle Park" },
    ],
    skipDuplicates: true,
  });
  console.log(`Seeded ${result.count} location(s).`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
