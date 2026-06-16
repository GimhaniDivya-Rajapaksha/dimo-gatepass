import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session as any)?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const chassis  = searchParams.get("chassis")?.trim() ?? "";
  const from     = searchParams.get("from");
  const to       = searchParams.get("to");

  if (!chassis && !from && !to) {
    return NextResponse.json({ records: [] });
  }

  const where: Record<string, unknown> = {};

  if (chassis) {
    where.chassis = { contains: chassis, mode: "insensitive" };
  }

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from + "T00:00:00.000Z");
    if (to)   dateFilter.lte = new Date(to   + "T23:59:59.999Z");
    where.createdAt = dateFilter;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let records: unknown[];
  try {
    records = await prisma.gatePass.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id:             true,
        gatePassNumber: true,
        passType:       true,
        passSubType:    true,
        status:         true,
        vehicle:        true,
        chassis:        true,
        make:           true,
        fromLocation:   true,
        toLocation:     true,
        departureDate:  true,
        departureTime:  true,
        arrivalDate:    true,
        arrivalTime:    true,
        createdAt:      true,
        createdBy:      { select: { name: true, email: true } },
        approvedBy:     { select: { name: true } },
      },
    });
  } catch (err) {
    console.error("[admin/records] DB error:", err);
    return NextResponse.json({ error: "Database query failed", records: [] }, { status: 500 });
  }

  return NextResponse.json({ records });
}
