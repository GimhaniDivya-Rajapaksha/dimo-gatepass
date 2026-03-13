import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!["INITIATOR", "APPROVER", "ADMIN"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const vehicleNo = new URL(req.url).searchParams.get("vehicleNo")?.trim() ?? "";
  if (!vehicleNo) return NextResponse.json({ vehicleMaster: null, passes: [], stats: {} });

  const [vehicleMaster, passes] = await Promise.all([
    prisma.vehicleOption.findFirst({
      where: {
        OR: [
          { vehicleNo: { contains: vehicleNo, mode: "insensitive" } },
          { chassisNo: { contains: vehicleNo, mode: "insensitive" } },
        ],
      },
    }),
    prisma.gatePass.findMany({
      where: {
        OR: [
          { vehicle: { contains: vehicleNo, mode: "insensitive" } },
          { chassis: { contains: vehicleNo, mode: "insensitive" } },
        ],
      },
      include: {
        createdBy:  { select: { name: true, email: true } },
        approvedBy: { select: { name: true } },
        subPasses: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
        parentPass: { select: { id: true, gatePassNumber: true, passSubType: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const stats = {
    total:     passes.length,
    approved:  passes.filter(p => p.status === "APPROVED").length,
    pending:   passes.filter(p => p.status === "PENDING_APPROVAL").length,
    rejected:  passes.filter(p => p.status === "REJECTED").length,
    gateOut:   passes.filter(p => p.status === "GATE_OUT").length,
    completed: passes.filter(p => p.status === "COMPLETED").length,
    cancelled: passes.filter(p => p.status === "CANCELLED").length,
  };

  // Current location = toLocation of the most recent COMPLETED pass
  const currentLocation =
    passes.find(p => p.status === "COMPLETED" && p.toLocation)?.toLocation ?? null;

  return NextResponse.json({ vehicleMaster, passes, stats, currentLocation });
}
