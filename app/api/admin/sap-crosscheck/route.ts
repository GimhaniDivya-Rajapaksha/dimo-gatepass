import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlantVehicleRows } from "@/lib/location-api";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((session as any)?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const chassis = searchParams.get("chassis")?.trim() ?? "";
  const from    = searchParams.get("from");
  const to      = searchParams.get("to");

  if (!chassis && !from && !to) {
    return NextResponse.json({ results: [] });
  }

  // ── 1. Get latest gate pass per chassis from DB ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (chassis) where.chassis = { contains: chassis, mode: "insensitive" };
  if (from || to) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const df: any = {};
    if (from) df.gte = new Date(from + "T00:00:00.000Z");
    if (to)   df.lte = new Date(to   + "T23:59:59.999Z");
    where.createdAt = df;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let passes: any[];
  try {
    passes = await prisma.gatePass.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        vehicle:           true,
        chassis:           true,
        toLocation:        true,
        toPlantCode:       true,
        toStorageLocation: true,
        status:            true,
      },
    });
  } catch (err) {
    console.error("[sap-crosscheck] DB error:", err);
    return NextResponse.json({ error: "Database query failed", results: [] }, { status: 500 });
  }

  // Keep only the most recent pass per chassis (first occurrence because ordered desc)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestMap = new Map<string, any>();
  for (const p of passes) {
    const key = (p.chassis || p.vehicle || "").toUpperCase();
    if (key && !latestMap.has(key)) latestMap.set(key, p);
  }

  if (latestMap.size === 0) return NextResponse.json({ results: [] });

  // ── 2. Fetch SAP plant data ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sapRows: any[] = [];
  let sapError = false;
  try {
    // Pass chassis as filter when only one chassis is searched — avoids fetching all SAP data
    sapRows = await fetchPlantVehicleRows(chassis || undefined);
  } catch (err) {
    console.error("[sap-crosscheck] SAP fetch error:", err);
    sapError = true;
  }

  // ── 3. Build comparison results ───────────────────────────────────────────
  const results = Array.from(latestMap.values()).map(gp => {
    const chassisUp = (gp.chassis || "").toUpperCase();
    const vehicleUp = (gp.vehicle || "").toUpperCase();

    // Match SAP row by chassis (chassisNo) or vehicle number (externalNo / internalNo)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sapRow = sapRows.find((r: any) => {
      const vhvin = (r.chassisNo  || "").toUpperCase();
      const vhcex = (r.externalNo || "").toUpperCase();
      const vhcle = (r.internalNo || "").toUpperCase();
      return (
        (chassisUp && (vhvin === chassisUp || vhcex === chassisUp || vhcle === chassisUp)) ||
        (vehicleUp && (vhcex === vehicleUp || vhcle === vehicleUp))
      );
    });

    const sapPlantCode     = sapRow ? (sapRow.plantCode        || "") : null;
    const sapStorageLoc    = sapRow ? (sapRow.storageLocation  || "") : null;
    const sapPlantDesc     = sapRow ? (sapRow.plantDescription || "") : null;
    const sapStorageDesc   = sapRow ? (sapRow.storageDescription || "") : null;
    const sapLocation      = sapRow ? `${sapPlantDesc} - ${sapStorageDesc}` : null;

    // Compare using plant + storage codes (most reliable)
    let match: boolean | null = null;
    if (!sapError && sapRow && gp.toPlantCode && gp.toStorageLocation && sapPlantCode && sapStorageLoc) {
      match = gp.toPlantCode === sapPlantCode && gp.toStorageLocation === sapStorageLoc;
    }

    return {
      vehicle:           gp.vehicle,
      chassis:           gp.chassis,
      systemLocation:    gp.toLocation   ?? "—",
      sapLocation:       sapLocation,
      match,
      notInSap:          !sapError && !sapRow,
      sapError,
    };
  });

  return NextResponse.json({ results });
}
