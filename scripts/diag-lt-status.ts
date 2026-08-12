import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const exists = await prisma.$queryRaw<{exists:boolean}[]>`
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'LtVehicleStatusOption') as exists
  `.catch((e) => { console.log("ERR", e.message); return null; });
  console.log("LtVehicleStatusOption table exists:", exists);
  if (exists?.[0]?.exists) {
    const rows = await prisma.$queryRaw`SELECT "code","enabled" FROM "LtVehicleStatusOption" WHERE "code" = 'QP40'`.catch((e) => { console.log("ERR", e.message); return null; });
    console.log("QP40 row:", rows);
  }
}
main().finally(() => prisma.$disconnect());
