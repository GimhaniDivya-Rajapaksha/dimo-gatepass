import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeSingleReconciliation } from "@/lib/sap-reconciliation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

// Bulk "Write Selected to SAP" — processes each vehicle independently; one failure never
// stops the rest. Each vehicle is revalidated against SAP right before its own write.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { reconciliationIds } = await req.json();
  if (!Array.isArray(reconciliationIds) || reconciliationIds.length === 0) {
    return NextResponse.json({ error: "reconciliationIds is required" }, { status: 400 });
  }

  const results: { reconciliationId: string; success: boolean; alreadyWritten?: boolean; message: string }[] = [];
  for (const reconciliationId of reconciliationIds) {
    const result = await writeSingleReconciliation({
      reconciliationId,
      adminId: session!.user.id,
      adminName: session!.user.name ?? "Admin",
      mode: "BULK",
    });
    results.push({ reconciliationId, ...result });
  }

  return NextResponse.json({ results });
}
