import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { userId, defaultLocation, brand, approverId, backupApproverId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (approverId && backupApproverId && approverId === backupApproverId) {
    return NextResponse.json({ error: "Approver 1 and Approver 2 must be different" }, { status: 400 });
  }

  try { await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brand" TEXT`; } catch { /* ignore */ }
  try { await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "backupApproverId" TEXT`; } catch { /* ignore */ }

  // Build SET clause dynamically and execute as raw SQL so Prisma never tries
  // to deserialize the user row (which may contain enum values added after the
  // last prisma generate, e.g. DELIVERY_COORDINATOR).
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (defaultLocation !== undefined) {
    setClauses.push(`"defaultLocation" = $${paramIdx++}`);
    values.push(defaultLocation || null);
  }
  if (brand !== undefined) {
    setClauses.push(`brand = $${paramIdx++}`);
    values.push(brand || null);
  }
  if (approverId !== undefined) {
    setClauses.push(`"approverId" = $${paramIdx++}`);
    values.push(approverId || null);
  }
  if (backupApproverId !== undefined) {
    setClauses.push(`"backupApproverId" = $${paramIdx++}`);
    values.push(backupApproverId || null);
  }

  if (setClauses.length > 0) {
    values.push(userId);
    const sql = `UPDATE "User" SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`;
    await prisma.$executeRawUnsafe(sql, ...values);
  }

  return NextResponse.json({ success: true });
}
