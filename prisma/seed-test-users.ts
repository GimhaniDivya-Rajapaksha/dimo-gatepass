import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const pw = "Test@1234";

async function main() {
  const hash = await bcrypt.hash(pw, 12);

  // ── Upsert all 8 users ────────────────────────────────────────────────
  const users = [
    { name: "Initiator One",  email: "initiator1@dimo.lk", role: "INITIATOR",        location: "Colombo TATA - Altair Showroom", brand: "Mercedes-Benz, TATA" },
    { name: "Approver One",   email: "approver1@dimo.lk",  role: "APPROVER",         location: "Colombo TATA - Altair Showroom", brand: "Mercedes-Benz, TATA" },
    { name: "Cashier One",    email: "cashier1@dimo.lk",   role: "CASHIER",          location: "Colombo TATA - Altair Showroom", brand: "Mercedes-Benz, TATA" },
    { name: "Security One",   email: "security1@dimo.lk",  role: "SECURITY_OFFICER", location: "Colombo TATA - Altair Showroom", brand: "Mercedes-Benz, TATA" },
    { name: "Initiator Two",  email: "initiator2@dimo.lk", role: "INITIATOR",        location: "Kandy Branch - Vehicle Park-1",   brand: "Mercedes-Benz, TATA" },
    { name: "Approver Two",   email: "approver2@dimo.lk",  role: "APPROVER",         location: "Kandy Branch - Vehicle Park-1",   brand: "Mercedes-Benz, TATA" },
    { name: "Cashier Two",    email: "cashier2@dimo.lk",   role: "CASHIER",          location: "Kandy Branch - Vehicle Park-1",   brand: "Mercedes-Benz, TATA" },
    { name: "Security Two",   email: "security2@dimo.lk",  role: "SECURITY_OFFICER", location: "Kandy Branch - Vehicle Park-1",   brand: "Mercedes-Benz, TATA" },
  ];

  for (const u of users) {
    const brand = u.brand ? `'${u.brand}'` : "NULL";
    await prisma.$executeRawUnsafe(`
      INSERT INTO "User" (id, name, email, "passwordHash", role, "defaultLocation", brand, "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        '${u.name}',
        '${u.email}',
        '${hash}',
        '${u.role}'::"Role",
        '${u.location}',
        ${brand},
        NOW(),
        NOW()
      )
      ON CONFLICT (email) DO UPDATE
        SET "passwordHash"    = '${hash}',
            role              = '${u.role}'::"Role",
            name              = '${u.name}',
            "defaultLocation" = '${u.location}',
            brand             = ${brand},
            "updatedAt"       = NOW()
    `);
    console.log(`✓ ${u.role.padEnd(18)} ${u.email}  →  ${u.location}`);
  }

  // ── Link initiators to their approvers ───────────────────────────────
  const approver1 = await prisma.user.findUnique({ where: { email: "approver1@dimo.lk" } });
  const approver2 = await prisma.user.findUnique({ where: { email: "approver2@dimo.lk" } });

  if (approver1) {
    await prisma.user.update({ where: { email: "initiator1@dimo.lk" }, data: { approverId: approver1.id } });
    console.log(`\n✓ initiator1 → approver1 (${approver1.name})`);
  }
  if (approver2) {
    await prisma.user.update({ where: { email: "initiator2@dimo.lk" }, data: { approverId: approver2.id } });
    console.log(`✓ initiator2 → approver2 (${approver2.name})`);
  }

  console.log(`\nPassword for all: ${pw}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
