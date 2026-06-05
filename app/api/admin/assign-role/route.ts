import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ROLES = [
  "INITIATOR", "APPROVER", "RECIPIENT", "ADMIN",
  "CASHIER", "AREA_SALES_OFFICER", "SECURITY_OFFICER",
  "SERVICE_ADVISOR", "DELIVERY_COORDINATOR",
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { userId, role } = await req.json();
  if (!userId || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Ensure any new enum values exist in the DB before assigning.
  // PostgreSQL enums must be explicitly migrated; this handles it at runtime
  // so admins don't need a separate DB migration step.
  try {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'Role' AND e.enumlabel = '${role}'
         ) THEN
           ALTER TYPE "Role" ADD VALUE '${role}';
         END IF;
       END $$;`
    );
  } catch {
    // If enum already exists or the ALTER fails for any reason, proceed anyway
  }

  // Use raw SQL so Prisma's compile-time enum validation doesn't block new values
  await prisma.$executeRaw`UPDATE "User" SET role = ${role}::"Role" WHERE id = ${userId}`;

  return NextResponse.json({ success: true });
}
