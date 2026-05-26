import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchPlantVehicleRows, findPlantVehicleRow, formatPlantLocationLabel } from "@/lib/location-api";

type LocationLookupItem = {
  key?: string;
  vehicleNo?: string | null;
  chassisNo?: string | null;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!["INITIATOR", "APPROVER", "ADMIN", "AREA_SALES_OFFICER", "CASHIER", "SECURITY_OFFICER", "SERVICE_ADVISOR", "RECIPIENT"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { items?: LocationLookupItem[] };
  const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
  if (items.length === 0) return NextResponse.json({ locations: {} });

  const rows = await fetchPlantVehicleRows().catch(() => []);
  const locations: Record<string, string | null> = {};

  for (const item of items) {
    const key = String(item.key ?? "").trim();
    if (!key) continue;

    const row = findPlantVehicleRow(rows, [
      item.vehicleNo,
      item.chassisNo,
    ]);

    locations[key] = row ? formatPlantLocationLabel(row) || null : null;
  }

  return NextResponse.json({ locations });
}
