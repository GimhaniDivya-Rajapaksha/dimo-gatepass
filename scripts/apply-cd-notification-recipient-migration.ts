/**
 * Applies the CdNotificationRecipient migration via the working pooler connection
 * (DATABASE_URL), since `prisma db execute` requires the direct (non-pooled) host which is
 * unreachable here (same IPv6 issue as the other manually-applied migrations).
 * Run: npx tsx scripts/apply-cd-notification-recipient-migration.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const statements = [
  `CREATE TABLE IF NOT EXISTS "CdNotificationRecipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CdNotificationRecipient_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CdNotificationRecipient_email_key" ON "CdNotificationRecipient"("email")`,
];

async function main() {
  for (const [i, sql] of statements.entries()) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`Statement ${i + 1}/${statements.length} OK`);
  }
  console.log("Migration applied successfully.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
