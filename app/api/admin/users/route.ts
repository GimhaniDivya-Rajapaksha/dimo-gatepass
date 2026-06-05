import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // Use raw SQL so Prisma never deserializes enum values that may have been
    // added to the DB after the last prisma generate (e.g. DELIVERY_COORDINATOR).
    const users = await prisma.$queryRaw<{
      id: string; name: string; email: string; role: string | null;
      createdAt: Date; approverId: string | null; defaultLocation: string | null;
      brand: string | null; backupApproverId: string | null; isDisabled: boolean;
      approverName: string | null; approverId2: string | null;
      backupApproverName: string | null;
    }[]>`
      SELECT
        u.id, u.name, u.email, u.role::text AS role,
        u."createdAt", u."approverId", u."defaultLocation",
        u.brand, u."backupApproverId", u."isDisabled",
        a.name AS "approverName", a.id AS "approverId2",
        b.name AS "backupApproverName"
      FROM "User" u
      LEFT JOIN "User" a ON a.id = u."approverId"
      LEFT JOIN "User" b ON b.id = u."backupApproverId"
      ORDER BY u."createdAt" DESC
    `;

    const shaped = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      approverId: u.approverId,
      defaultLocation: u.defaultLocation,
      brand: u.brand,
      backupApproverId: u.backupApproverId,
      isDisabled: u.isDisabled,
      approver: u.approverId2 ? { id: u.approverId2, name: u.approverName } : null,
      backupApprover: u.backupApproverId ? { id: u.backupApproverId, name: u.backupApproverName } : null,
    }));

    return NextResponse.json(shaped);
  } catch (e) {
    console.error("Admin users error:", e);
    return NextResponse.json({ error: "Unable to load users right now. Please try again." }, { status: 500 });
  }
}
