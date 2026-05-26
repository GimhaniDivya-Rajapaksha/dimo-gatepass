import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      include: { gatePass: { select: { id: true, gatePassNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return NextResponse.json({ notifications }, {
      headers: { "Cache-Control": "private, max-age=20" },
    });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
