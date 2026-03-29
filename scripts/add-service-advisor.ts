/**
 * Adds SERVICE_ADVISOR role to DB and creates the user.
 * Run: npx tsx scripts/add-service-advisor.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1. Add SERVICE_ADVISOR to the Role enum (safe — no-op if already exists)
  try {
    await prisma.$executeRaw`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SERVICE_ADVISOR'`;
    console.log("✅ Role enum updated: SERVICE_ADVISOR added");
  } catch (e) {
    console.log("ℹ️  Role enum already has SERVICE_ADVISOR (or needs commit boundary)");
    // PostgreSQL requires ADD VALUE to run outside a transaction — try raw exec
  }

  // 2. Create Service Advisor user
  const hash = await bcrypt.hash("password123", 12);
  await prisma.$executeRaw`
    INSERT INTO "User" (id, name, email, "passwordHash", role, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      'Service Advisor',
      'serviceadvisor@dimo.lk',
      ${hash},
      'SERVICE_ADVISOR'::"Role",
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
      SET "passwordHash" = ${hash},
          role            = 'SERVICE_ADVISOR'::"Role",
          "updatedAt"     = NOW()
  `;
  console.log("✅ Created: serviceadvisor@dimo.lk (SERVICE_ADVISOR) — password: password123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
