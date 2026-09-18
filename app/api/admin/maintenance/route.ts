import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMaintenanceStatus, setMaintenanceStatus } from "@/lib/maintenance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

// Accepts an ISO string, a datetime-local value ("2026-09-18T20:00"), null/"" (clears the
// field), or undefined (field not provided — caller should keep the existing value in that
// case, handled by the route below). Returns undefined for "leave unchanged", null for
// "clear", or a valid Date.
function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
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

  const body = await req.json().catch(() => ({}));
  const { enabled, message, startAt, endAt } = body as {
    enabled?: boolean; message?: string | null; startAt?: string | null; endAt?: string | null;
  };
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  const cleanMessage = typeof message === "string" && message.trim() ? message.trim() : null;

  const parsedStart = parseOptionalDate(startAt);
  const parsedEnd = parseOptionalDate(endAt);
  if (parsedStart === undefined && startAt !== undefined) {
    return NextResponse.json({ error: "Invalid start date/time." }, { status: 400 });
  }
  if (parsedEnd === undefined && endAt !== undefined) {
    return NextResponse.json({ error: "Invalid end date/time." }, { status: 400 });
  }
  if (parsedStart instanceof Date && parsedEnd instanceof Date && parsedEnd <= parsedStart) {
    return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
  }

  try {
    // Keep the existing value for a field the caller didn't send at all.
    const current = await getMaintenanceStatus();
    const finalStart: Date | null = startAt === undefined
      ? (current.startAt ? new Date(current.startAt) : null)
      : (parsedStart ?? null);
    const finalEnd: Date | null = endAt === undefined
      ? (current.endAt ? new Date(current.endAt) : null)
      : (parsedEnd ?? null);

    const status = await setMaintenanceStatus({
      enabled,
      message: cleanMessage,
      startAt: finalStart,
      endAt: finalEnd,
      updatedById: session!.user.id ?? null,
    });
    return NextResponse.json(status);
  } catch (e) {
    console.error("[admin/maintenance] update failed:", e);
    return NextResponse.json({ error: "Unable to update maintenance mode right now. Please try again." }, { status: 500 });
  }
}
