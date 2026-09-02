import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedAdminLocations } from "@/lib/admin-locations";

// DB-only — never calls SAP directly. The list is populated/refreshed via the admin
// "Refresh from SAP" action (POST /api/admin/locations/refresh), not on every page load,
// since the live SAP /plant call has been slow/unreliable. See lib/admin-locations.ts.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { locations, plants } = await getCachedAdminLocations();
    return NextResponse.json({ locations, plants });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ locations: [], plants: [] });
  }
}
