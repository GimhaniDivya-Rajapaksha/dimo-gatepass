import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const vehicleNo = params.get("vehicleNo") ?? "";
  const chassisNo = params.get("chassisNo") ?? "";
  if (!vehicleNo && !chassisNo) return NextResponse.json({ passes: [] });

  const where = chassisNo
    ? { chassis: { equals: chassisNo, mode: "insensitive" as const } }
    : { vehicle: { contains: vehicleNo, mode: "insensitive" as const } };

  try {
    const passes = await prisma.gatePass.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        subPasses: { include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        parentPass: { select: { id: true, gatePassNumber: true, passSubType: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ passes });
  } catch (err) {
    console.error("[by-vehicle] error:", err);
    return NextResponse.json({ error: "Internal server error", passes: [] }, { status: 500 });
  }
}
