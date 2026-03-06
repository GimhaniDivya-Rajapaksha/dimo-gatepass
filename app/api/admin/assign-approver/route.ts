import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId, approverId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await (prisma.user.update as any)({
    where: { id: userId },
    data: { approverId: approverId || null },
    select: { id: true, name: true, approverId: true },
  });

  return NextResponse.json({ user: updated });
}
