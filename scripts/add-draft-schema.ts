import { PrismaClient } from "@prisma/client";
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL + "?pgbouncer=true&connection_limit=1" } } });
async function run() {
  await p.$executeRaw`ALTER TYPE "GatePassStatus" ADD VALUE IF NOT EXISTS 'DRAFT'`;
  console.log("✅ DRAFT status added to GatePassStatus enum");
  await p.$executeRaw`ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "securityCreated" BOOLEAN NOT NULL DEFAULT false`;
  console.log("✅ securityCreated column added");
  await p.$executeRaw`ALTER TABLE "GatePass" ADD COLUMN IF NOT EXISTS "gateDirection" TEXT`;
  console.log("✅ gateDirection column added");
}
run().catch(e => { console.error(e.message); process.exit(1); }).finally(() => p.$disconnect());
