/**
 * Creates/updates a local test APPROVER account, reusing an existing test Initiator's
 * defaultLocation (if one exists) so it actually routes for approval-testing purposes.
 * Run: npx tsx scripts/add-test-approver.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "testapprover@dimo.lk";
const NAME = "Test Approver";
const PASSWORD = "password123";

async function main() {
  const initiator = await prisma.user.findFirst({
    where: { role: "INITIATOR", defaultLocation: { not: null } },
    select: { defaultLocation: true },
    orderBy: { createdAt: "asc" },
  });
  const defaultLocation = initiator?.defaultLocation ?? null;

  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.$executeRaw`
    INSERT INTO "User" (id, name, email, "passwordHash", role, "defaultLocation", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      ${NAME},
      ${EMAIL},
      ${hash},
      'APPROVER'::"Role",
      ${defaultLocation},
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
      SET "passwordHash"    = ${hash},
          role              = 'APPROVER'::"Role",
          "defaultLocation" = ${defaultLocation},
          "updatedAt"       = NOW()
  `;

  console.log(`Created/updated: ${EMAIL} (APPROVER) — password: ${PASSWORD}`);
  console.log(`defaultLocation set to: ${defaultLocation ?? "(none found — set manually via Admin > Assign Attributes)"}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
