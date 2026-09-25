import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncPlantCacheFromSap, getLastPlantCacheSync } from "@/lib/plant-cache";
import { prisma } from "@/lib/prisma";

// Admin-only — status GET is read-only (last sync log + current row counts); POST triggers an
// on-demand full resync from live SAP /plant. Automatic daily sync is handled separately by
// lib/plantCacheScheduler.ts (started once at server boot via instrumentation.ts).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [lastSync, vehicleCount, materialCount] = await Promise.all([
    getLastPlantCacheSync(),
    prisma.plantVehicleCache.count(),
    prisma.plantMaterial.count(),
  ]);

  return NextResponse.json({ lastSync, vehicleCount, materialCount });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await syncPlantCacheFromSap({ trigger: "MANUAL", triggeredById: session.user.id ?? null });
    const lastSync = await getLastPlantCacheSync();
    return NextResponse.json({ ...result, lastSync });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Plant cache sync failed.";
    console.error("[admin/plant-cache] manual sync failed:", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
