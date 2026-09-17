import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMaintenanceStatus, setMaintenanceStatus } from "@/lib/maintenance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const status = await getMaintenanceStatus();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { enabled, message } = await req.json();
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  const cleanMessage = typeof message === "string" && message.trim() ? message.trim() : null;

  try {
    const status = await setMaintenanceStatus({ enabled, message: cleanMessage, updatedById: session!.user.id ?? null });
    return NextResponse.json(status);
  } catch (e) {
    console.error("[admin/maintenance] update failed:", e);
    return NextResponse.json({ error: "Unable to update maintenance mode right now. Please try again." }, { status: 500 });
  }
}
