import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runReconciliationCheck } from "@/lib/sap-reconciliation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

// Manual "Check Now" — re-runs the same check-only logic as the daily 3 PM job. Never
// writes to SAP; only re-fetches statuses and updates eligibility + notifies Initiators.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const result = await runReconciliationCheck({
      triggeredById: session!.user.id,
      triggeredByName: session!.user.name ?? "Admin",
      mode: "MANUAL",
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[admin/sap-reconciliation/check] failed:", e);
    return NextResponse.json({ error: "Reconciliation check failed. Please try again." }, { status: 500 });
  }
}
