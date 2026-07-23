import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only, system-wide notification feed — every notification ever created, for every
// user, across every plant. Fully separate from /api/notifications (the personal bell),
// which stays scoped to userId for every role exactly as before.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const q = (searchParams.get("q") ?? "").trim();
  const type = searchParams.get("type") ?? "";

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { gatePass: { gatePassNumber: { contains: q, mode: "insensitive" } } },
    ];
  }

  try {
    const [total, notifications, types] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true, defaultLocation: true } },
          gatePass: { select: { id: true, gatePassNumber: true, passType: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.findMany({
        distinct: ["type"],
        select: { type: true },
        orderBy: { type: "asc" },
      }),
    ]);

    return NextResponse.json(
      { notifications, total, page, limit, types: types.map((t) => t.type) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[admin/notifications] error:", e);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}
