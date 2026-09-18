import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSystemNoticeEnabled, setSystemNoticeEnabled } from "@/lib/system-notice";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const enabled = await isSystemNoticeEnabled();
  return NextResponse.json({ enabled });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { enabled } = await req.json();
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });

  try {
    const result = await setSystemNoticeEnabled({ enabled, updatedById: session!.user.id ?? null });
    return NextResponse.json({ enabled: result });
  } catch (e) {
    console.error("[admin/system-notice] update failed:", e);
    return NextResponse.json({ error: "Unable to update system notice right now. Please try again." }, { status: 500 });
  }
}
