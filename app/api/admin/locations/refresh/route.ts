import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { refreshAdminLocationsFromSap, getCachedAdminLocations } from "@/lib/admin-locations";

// Admin-triggered only — re-fetches SAP /plant live and replaces the admin location cache.
// Never called automatically; the picker itself (GET /api/admin/locations) is DB-only.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { count } = await refreshAdminLocationsFromSap();
    const { locations, plants } = await getCachedAdminLocations();
    return NextResponse.json({ count, locations, plants });
  } catch (e) {
    const message = e instanceof Error ? e.message : "SAP refresh failed.";
    console.error("[admin/locations/refresh] failed:", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
