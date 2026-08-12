import { ensureSeeded } from "../lib/lt-status-config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  await ensureSeeded();
  const rows = await prisma.$queryRaw<{ code: string; enabled: boolean }[]>`SELECT "code","enabled" FROM "LtVehicleStatusOption" ORDER BY "code"`;
  console.log("Seeded rows:", rows.length);
  console.log(rows.find(r => r.code === "QP40"));
}
main().finally(() => prisma.$disconnect());
