import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "DELIVERY_COORDINATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dcLocation = (session.user as { defaultLocation?: string | null }).defaultLocation;
  const plant = dcLocation ? dcLocation.split(" - ")[0].trim() : null;

  const locationWhere = plant
    ? {
        OR: [
          { fromLocation: { startsWith: plant, mode: "insensitive" as const } },
          { toLocation:   { startsWith: plant, mode: "insensitive" as const } },
        ],
      }
    : {};

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalAll,
    totalToday,
    byStatus,
    byType,
    pendingApproval,
    gateOut,
    completedToday,
    recentPasses,
    inTransitToLocation,
  ] = await Promise.all([
    // Total all-time at location
    prisma.gatePass.count({ where: locationWhere as any }),

    // Total today
    prisma.gatePass.count({
      where: { ...(locationWhere as any), createdAt: { gte: todayStart } },
    }),

    // Counts by status (all-time at location)
    prisma.gatePass.groupBy({
      by: ["status"],
      where: locationWhere as any,
      _count: { id: true },
    }),

    // Counts by type (all-time at location)
    prisma.gatePass.groupBy({
      by: ["passType"],
      where: locationWhere as any,
      _count: { id: true },
    }),

    // Pending approval passes (needs action)
    prisma.gatePass.count({
      where: { ...(locationWhere as any), status: "PENDING_APPROVAL" },
    }),

    // Gate Out (vehicles in transit right now)
    prisma.gatePass.count({
      where: { ...(locationWhere as any), status: "GATE_OUT" },
    }),

    // Completed today
    prisma.gatePass.count({
      where: {
        ...(locationWhere as any),
        status: "COMPLETED",
        updatedAt: { gte: todayStart },
      },
    }),

    // Recent 15 passes (any status)
    prisma.gatePass.findMany({
      where: locationWhere as any,
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        gatePassNumber: true,
        passType: true,
        passSubType: true,
        status: true,
        vehicle: true,
        chassis: true,
        fromLocation: true,
        toLocation: true,
        updatedAt: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),

    // Vehicles arriving (GATE_OUT heading TO this location)
    plant
      ? prisma.gatePass.count({
          where: {
            status: "GATE_OUT",
            toLocation: { startsWith: plant, mode: "insensitive" },
          },
        })
      : Promise.resolve(0),
  ]);

  // Build status map
  const statusMap: Record<string, number> = {};
  for (const row of byStatus) {
    statusMap[row.status] = row._count.id;
  }

  // Build type map
  const typeMap: Record<string, number> = {};
  for (const row of byType) {
    typeMap[row.passType] = row._count.id;
  }

  return NextResponse.json({
    location: dcLocation,
    totalAll,
    totalToday,
    pendingApproval,
    gateOut,
    completedToday,
    inTransitToLocation,
    byStatus: statusMap,
    byType: typeMap,
    recentPasses,
  });
}
