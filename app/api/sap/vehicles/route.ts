import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchSapVehicles } from "@/lib/sap";

/**
 * GET /api/sap/vehicles?q=search&passType=LOCATION_TRANSFER|CUSTOMER_DELIVERY|both
 *
 * Returns vehicles from SAP OData APIs.
 * Used by the vehicle search dropdown in Create Gate Pass form.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")        ?? "";
  const passType = (searchParams.get("passType") ?? "both") as
    "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "both";

  try {
    const vehicles = await fetchSapVehicles(q, passType);

    // Normalise to the same shape the lookups route returns for vehicles
    const options = vehicles.map((v) => ({
      id:           v.internalNo || v.chassisNo || v.vehicleNo,
      value:        v.vehicleNo  || v.chassisNo,   // licence plate → "vehicle" field
      label:        v.chassisNo
                      ? `${v.vehicleNo || v.chassisNo} / ${v.chassisNo}`
                      : (v.vehicleNo || v.chassisNo),
      chassisNo:    v.chassisNo,
      description:  v.model,
      model:        v.model,
      make:         v.make,
      colour:       v.colour,
      colourFamily: "",
      statusDesc:   v.statusDesc,
      // raw SAP fields (useful for debugging)
      _primaryStatus:   v.primaryStatus,
      _secondaryStatus: v.secondaryStatus,
    }));

    return NextResponse.json({ options });
  } catch (err) {
    console.error("[SAP /vehicles]", err);
    // Return empty list — the lookups route will fall back to local DB
    return NextResponse.json(
      { options: [], error: err instanceof Error ? err.message : "SAP unavailable" },
      { status: 200 } // 200 so the client can still fall back gracefully
    );
  }
}
