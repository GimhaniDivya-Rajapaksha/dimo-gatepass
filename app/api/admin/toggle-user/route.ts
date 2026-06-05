import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Admin cannot disable their own account
  if (userId === session.user.id) {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }

  try {
    const user = await (prisma.user as any).findUnique({ where: { id: userId }, select: { id: true, isDisabled: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updated = await (prisma.user as any).update({
      where: { id: userId },
      data: { isDisabled: !(user.isDisabled ?? false) },
      select: { id: true, isDisabled: true },
    });

    return NextResponse.json({ isDisabled: updated.isDisabled ?? false });
  } catch (err) {
    console.error("[toggle-user] error:", err);
    return NextResponse.json({ error: "Failed to update user status." }, { status: 500 });
  }
}
