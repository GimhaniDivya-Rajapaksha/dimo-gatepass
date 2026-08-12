import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const exists = await prisma.$queryRaw<{exists:boolean}[]>`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_prisma_migrations') as exists`.catch(() => null);
  console.log("_prisma_migrations table exists:", exists);
  if (exists?.[0]?.exists) {
    const rows = await prisma.$queryRaw`SELECT migration_name, finished_at, success FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 10`.catch((e) => { console.log("ERR", e.message); return null; });
    console.log(rows);
  }
}
main().finally(() => prisma.$disconnect());
