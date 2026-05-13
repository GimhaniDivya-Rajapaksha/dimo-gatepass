import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlantLocationOptions, fetchPlantVehicleRows, findPlantVehicleRow } from "@/lib/location-api";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!["INITIATOR", "APPROVER", "ADMIN", "AREA_SALES_OFFICER", "CASHIER"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = new URL(req.url).searchParams;
  const vehicleNo = searchParams.get("vehicleNo")?.trim() ?? "";
  const chassisNo = searchParams.get("chassisNo")?.trim() ?? "";
  const searchTerms = [vehicleNo, chassisNo].filter(Boolean);
  if (searchTerms.length === 0) return NextResponse.json({ vehicleMaster: null, passes: [], stats: {} });

  const [vehicleMaster, passes, plantRows, plantLocations] = await Promise.all([
    prisma.vehicleOption.findFirst({
      where: {
        OR: searchTerms.flatMap((term) => ([
          { vehicleNo: { contains: term, mode: "insensitive" as const } },
          { chassisNo: { contains: term, mode: "insensitive" as const } },
        ])),
      },
    }),
    prisma.gatePass.findMany({
      where: {
        OR: searchTerms.flatMap((term) => ([
          { vehicle: { contains: term, mode: "insensitive" as const } },
          { chassis: { contains: term, mode: "insensitive" as const } },
        ])),
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
    fetchPlantVehicleRows().catch(() => []),
    fetchPlantLocationOptions().catch(() => []),
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

  const currentPlantLocation = findPlantVehicleRow(plantRows, [
    vehicleNo,
    chassisNo,
    vehicleMaster?.vehicleNo ?? null,
    vehicleMaster?.chassisNo ?? null,
  ]);

  const currentLocation = currentPlantLocation
    ? [currentPlantLocation.plantDescription, currentPlantLocation.storageDescription]
        .filter(Boolean)
        .join(" - ")
    : passes.find(p => p.status === "COMPLETED" && p.toLocation)?.toLocation ?? null;

  return NextResponse.json({
    vehicleMaster,
    passes,
    stats,
    currentLocation,
    currentPlantLocation,
    plantLocations,
  });
}
