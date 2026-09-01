import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeSingleReconciliation } from "@/lib/sap-reconciliation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

// Individual "Write to SAP" — always revalidates current SAP status before writing, and
// refuses if this record is already WRITTEN (duplicate-write guard).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { reconciliationId } = await req.json();
  if (!reconciliationId) return NextResponse.json({ error: "reconciliationId is required" }, { status: 400 });

  const result = await writeSingleReconciliation({
    reconciliationId,
    adminId: session!.user.id,
    adminName: session!.user.name ?? "Admin",
    mode: "INDIVIDUAL",
  });

  return NextResponse.json(result, { status: result.success ? 200 : 409 });
}
