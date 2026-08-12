import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LT_STATUS_CODES, LT_CATCH_ALL_PREFIXES, ensureSeeded } from "@/lib/lt-status-config";

// Admin-configurable status codes that control which vehicles appear in the Location
// Transfer vehicle dropdown. Raw SQL throughout — never depends on the Prisma client
// having been regenerated after the schema change (matches the existing defensive style
// used for UserPlantMapping).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  await ensureSeeded();
  const rows = await prisma.$queryRaw<{ code: string; enabled: boolean }[]>`
    SELECT "code", "enabled" FROM "LtVehicleStatusOption"
  `.catch(() => [] as { code: string; enabled: boolean }[]);
  const byCode = new Map(rows.map((r) => [r.code, r.enabled]));

  // Ordered per LT_STATUS_CODES so the UI groups consistently; defaults missing rows to
  // enabled (shouldn't happen once seeded, but keeps a newly-added code safe by default).
  const data = LT_STATUS_CODES.map((code) => ({
    code,
    enabled: byCode.has(code) ? byCode.get(code)! : true,
    isCatchAll: code in LT_CATCH_ALL_PREFIXES,
  }));

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { code, enabled } = await req.json();
  if (typeof code !== "string" || !LT_STATUS_CODES.includes(code) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid code or enabled value" }, { status: 400 });
  }

  try {
    await ensureSeeded();
    await prisma.$executeRaw`
      UPDATE "LtVehicleStatusOption" SET "enabled" = ${enabled} WHERE "code" = ${code}
    `;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[admin/lt-status-config] update failed:", e);
    return NextResponse.json({ error: "Unable to save right now. Please try again." }, { status: 500 });
  }
}
