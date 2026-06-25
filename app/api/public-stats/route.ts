import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [gatePassCount, userCount, vehicleCount] = await Promise.all([
    prisma.gatePass.count(),
    prisma.user.count(),
    prisma.gatePass.groupBy({ by: ["chassis"], where: { chassis: { not: null } } }),
  ]);

  return NextResponse.json({
    gatePasses: gatePassCount,
    vehiclesTracked: vehicleCount.length,
    users: userCount,
  });
}
