import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchPlantVehicleRows } from "@/lib/location-api";
import { cachePlantRowsForChassis } from "@/lib/plant-cache";

// Same role list already used to create a gate pass (app/api/gate-pass/route.ts) — this is a
// read-only live SAP lookup for one exact chassis, triggered from the Location Transfer "To
// Location" field when a needed destination isn't showing yet. Chassis-only (not material) —
// deliberately kept to the same fast, already-proven filter this app has always used, so this
// user-facing action never depends on the newer, unconfirmed material filter.
const ALLOWED_ROLES = ["INITIATOR", "AREA_SALES_OFFICER", "SERVICE_ADVISOR", "CASHIER", "APPROVER"];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const chassisNo = typeof body.chassisNo === "string" ? body.chassisNo.trim().toUpperCase() : "";
  if (!chassisNo) {
    return NextResponse.json({ error: "Chassis number is required." }, { status: 400 });
  }

  try {
    const rows = await fetchPlantVehicleRows(chassisNo);
    if (rows.length === 0 || !rows.some((r) => r.extPlant && r.extSloc)) {
      return NextResponse.json({ error: "SAP has no location data for this vehicle right now." }, { status: 404 });
    }
    await cachePlantRowsForChassis(chassisNo, rows);
    return NextResponse.json({ ok: true, destinationCount: rows.filter((r) => r.extPlant && r.extSloc).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to fetch from SAP." }, { status: 502 });
  }
}
