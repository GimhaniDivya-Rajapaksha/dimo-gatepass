import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = "Dimo@2024";
  const hash = await bcrypt.hash(password, 12);

  const users = [
    {
      name: "Security - Weliweriya Finance",
      email: "security.weliweriya.finance@dimo.lk",
      role: "SECURITY_OFFICER",
      location: "Weliweriya DM Logistics - Finan.institute",
    },
    {
      name: "Security - DIMO 800",
      email: "security.dimo800@dimo.lk",
      role: "SECURITY_OFFICER",
      location: "Mercedeze Centre 800 - DIMO 800",
    },
    {
      name: "Security - Embilipitiya Branch",
      email: "security.embilipitiya@dimo.lk",
      role: "SECURITY_OFFICER",
      location: "Embilipitiya Branch - Vehicle park",
    },
    {
      name: "Security - Colombo TATA Head Office",
      email: "security.colombo.tata@dimo.lk",
      role: "SECURITY_OFFICER",
      location: "Colombo TATA - Head Office",
    },
    {
      name: "Security - Nishadhi Motors",
      email: "security.nishadhi@dimo.lk",
      role: "SECURITY_OFFICER",
      location: "Weliweriya DM Logistics - NISHADHI MOTORS",
    },
    {
      name: "Security - Weliweriya DM Logistics",
      email: "security.weliweriya@dimo.lk",
      role: "SECURITY_OFFICER",
      location: "Weliweriya DM Logistics - Vehicle Park-1",
    },
  ];

  for (const u of users) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "User" (id, name, email, "passwordHash", role, "defaultLocation", brand, "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        '${u.name}',
        '${u.email}',
        '${hash}',
        '${u.role}'::"Role",
        '${u.location}',
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE
        SET "passwordHash"    = '${hash}',
            role              = '${u.role}'::"Role",
            name              = '${u.name}',
            "defaultLocation" = '${u.location}',
            brand             = NULL,
            "updatedAt"       = NOW()
    `);
    console.log(`✓ ${u.email}  →  ${u.location}`);
  }

  console.log(`\nPassword for all: ${password}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
