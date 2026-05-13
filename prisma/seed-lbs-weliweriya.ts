import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LOCATION = "Luxary Buses Sales_Weliweriya - Vehicle Park";
const PASSWORD = "Dimo@2024";

const users = [
  {
    name:  "Initiator LBS Weliweriya",
    email: "initiator.lbs.weliweriya@dimo.lk",
    role:  "INITIATOR",
  },
  {
    name:  "Approver LBS Weliweriya",
    email: "approver.lbs.weliweriya@dimo.lk",
    role:  "APPROVER",
  },
  {
    name:  "Security LBS Weliweriya",
    email: "security.lbs.weliweriya@dimo.lk",
    role:  "SECURITY_OFFICER",
  },
];

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  for (const u of users) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "User" (id, name, email, "passwordHash", role, "defaultLocation", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        '${u.name}',
        '${u.email}',
        '${hash}',
        '${u.role}'::"Role",
        '${LOCATION}',
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE
        SET "passwordHash"    = '${hash}',
            role              = '${u.role}'::"Role",
            name              = '${u.name}',
            "defaultLocation" = '${LOCATION}',
            "updatedAt"       = NOW()
    `);
    console.log(`✓ ${u.role.padEnd(18)}  ${u.email}`);
  }

  // Link initiator → approver
  const approver = await prisma.user.findUnique({ where: { email: "approver.lbs.weliweriya@dimo.lk" } });
  if (approver) {
    await prisma.user.update({
      where: { email: "initiator.lbs.weliweriya@dimo.lk" },
      data:  { approverId: approver.id },
    });
    console.log(`\n✓ Initiator linked → Approver (${approver.name})`);
  }

  console.log(`\nLocation : ${LOCATION}`);
  console.log(`Password : ${PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
