import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const cashierHash = await bcrypt.hash("password123", 12);
  const asoHash = await bcrypt.hash("password123", 12);

  // Use raw SQL to bypass stale Prisma client enum validation
  await prisma.$executeRaw`
    INSERT INTO "User" (id, name, email, "passwordHash", role, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      'Divyanjana Gimhani',
      'divyanjanagimhani@gmail.com',
      ${cashierHash},
      'CASHIER'::"Role",
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
      SET "passwordHash" = ${cashierHash},
          role = 'CASHIER'::"Role",
          "updatedAt" = NOW()
  `;
  console.log("Upserted: divyanjanagimhani@gmail.com (CASHIER)");

  await prisma.$executeRaw`
    INSERT INTO "User" (id, name, email, "passwordHash", role, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      'Gimhani Rajapaksha',
      'gimhanirajapaksha390@gmail.com',
      ${asoHash},
      'AREA_SALES_OFFICER'::"Role",
      NOW(),
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
      SET "passwordHash" = ${asoHash},
          role = 'AREA_SALES_OFFICER'::"Role",
          "updatedAt" = NOW()
  `;
  console.log("Upserted: gimhanirajapaksha390@gmail.com (AREA_SALES_OFFICER)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
