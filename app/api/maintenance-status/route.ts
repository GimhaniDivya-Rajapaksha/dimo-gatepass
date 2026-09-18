import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMaintenanceStatus } from "@/lib/maintenance";

// Read-only, any signed-in user (not Admin-only like /api/admin/maintenance) — this is what
// SapMaintenanceOverlay polls client-side to know whether to show the overlay and what
// end time to count down to. No sensitive data here, just the same status every page's
// server-side layout already reads on load.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getMaintenanceStatus();
  return NextResponse.json(status);
}
