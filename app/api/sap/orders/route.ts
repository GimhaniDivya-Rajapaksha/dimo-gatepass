import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchSapOrders } from "@/lib/sap";

/**
 * GET /api/sap/orders?vin=CHASSIS&licplate=LICPLATE
 *
 * Fetches service/sales orders from SAP ZGATEPASS_ORDER for a given vehicle.
 * Used by the cashier review modal to auto-load orders.
 *
 * Returns:
 *   { orders: SapOrder[] }
 *   Each order: { orderId, docDate, billingDate, orderStatus, billingType,
 *                 payTermCode, payTerm, postingStatus, cancelled, isHappyPath }
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const vin        = searchParams.get("vin")        ?? "";
  const licplate   = searchParams.get("licplate")   ?? "";
  const internalNo = searchParams.get("internalNo") ?? "";

  if (!vin && !licplate && !internalNo) {
    return NextResponse.json({ orders: [] });
  }

  try {
    const orders = await fetchSapOrders(vin, licplate, internalNo);
    return NextResponse.json({ orders });
  } catch (err) {
    console.error("[SAP /orders]", err);
    return NextResponse.json(
      { orders: [], error: err instanceof Error ? err.message : "SAP unavailable" },
      { status: 200 }
    );
  }
}
