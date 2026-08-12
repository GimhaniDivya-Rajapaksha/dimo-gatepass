import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchPlantVehicleRows } from "@/lib/location-api";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const rows = await fetchPlantVehicleRows().catch(() => []);
    const seen = new Set<string>();
    const locations: string[] = [];

    for (const r of rows) {
      // Current location (Werks / Lgort)
      if (r.plantDescription && r.storageDescription) {
        const val = `${r.plantDescription} - ${r.storageDescription}`;
        if (!seen.has(val)) { seen.add(val); locations.push(val); }
      }
      // Ext / destination location (ext_plant / ext_sloc)
      if (r.extPlantDesc && r.extSlocDesc) {
        const val = `${r.extPlantDesc} - ${r.extSlocDesc}`;
        if (!seen.has(val)) { seen.add(val); locations.push(val); }
      }
    }

    // Deduped plant-level list (prefix before " - ") for the multi-plant mapping picker —
    // additive alongside the existing full location list, which is unchanged.
    const plantSeen = new Set<string>();
    const plants: string[] = [];
    for (const loc of locations) {
      const plant = loc.split(" - ")[0].trim();
      if (plant && !plantSeen.has(plant)) { plantSeen.add(plant); plants.push(plant); }
    }

    return NextResponse.json({ locations: locations.filter(Boolean).sort(), plants: plants.filter(Boolean).sort() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ locations: [] });
  }
}
