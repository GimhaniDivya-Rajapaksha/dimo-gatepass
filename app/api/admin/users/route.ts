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
    // Ensure brand column exists (safe to run repeatedly)
    await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brand" TEXT`;
  } catch { /* ignore */ }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = await (prisma.user as any).findMany({
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
        approverId: true, defaultLocation: true, brand: true,
        approver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(users);
  } catch (e) {
    console.error("Admin users error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "DB error" }, { status: 500 });
  }
}
