import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { userId, defaultLocation, brand, approverId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  try { await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brand" TEXT`; } catch { /* ignore */ }

  await (prisma.user as any).update({
    where: { id: userId },
    data: {
      ...(defaultLocation !== undefined ? { defaultLocation: defaultLocation || null } : {}),
      ...(brand !== undefined ? { brand: brand || null } : {}),
      ...(approverId !== undefined ? { approverId: approverId || null } : {}),
    },
  });
  return NextResponse.json({ success: true });
}
