import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlantVehicleRows, updateVehiclePlantLocation } from "@/lib/location-api";

type UpdateBody = {
  searchTerm?: string;
  vehicleNo?: string | null;
  chassisNo?: string | null;
  sapInternalNo?: string | null;
  sapExternalNo?: string | null;
  sapChassisNo?: string | null;
  plant?: string;
  storageLocation?: string;
};

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!["INITIATOR", "APPROVER", "ADMIN", "AREA_SALES_OFFICER", "CASHIER"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as UpdateBody;
  const plant = str(body.plant);
  const storageLocation = str(body.storageLocation);

  if (!plant || !storageLocation) {
    return NextResponse.json({ error: "Plant and storage location are required." }, { status: 400 });
  }

  const plantRows = await fetchPlantVehicleRows().catch(() => []);
  let targetLocation: { plantCode: string; plantDescription: string; storageLocation: string; storageDescription: string } | null =
    plantRows.find((row) => row.plantCode === plant && row.storageLocation === storageLocation) ?? null;

  if (!targetLocation) {
    const dbLoc = await prisma.locationOption.findFirst({
      where: { plantCode: plant, storageLocation },
    });
    if (dbLoc) {
      targetLocation = {
        plantCode: dbLoc.plantCode,
        plantDescription: dbLoc.plantDescription,
        storageLocation: dbLoc.storageLocation,
        storageDescription: dbLoc.storageDescription,
      };
    }
  }

  if (!targetLocation) {
    return NextResponse.json({ error: "Selected plant/storage location is not valid." }, { status: 400 });
  }

  try {
    const result = await updateVehiclePlantLocation({
      identifiers: [body.sapInternalNo, body.sapExternalNo, body.sapChassisNo, body.searchTerm, body.vehicleNo, body.chassisNo],
      destination: {
        plantCode: targetLocation.plantCode,
        plantDescription: targetLocation.plantDescription,
        storageLocation: targetLocation.storageLocation,
        storageDescription: targetLocation.storageDescription,
      },
      plantRows,
      sapFallback: {
        internalNo: body.sapInternalNo,
        // searchTerm / vehicleNo can be a chassis or external no — try as both
        externalNo: body.sapExternalNo || body.vehicleNo || body.searchTerm,
        chassisNo: body.sapChassisNo || body.chassisNo || body.searchTerm,
      },
    });

    return NextResponse.json({
      ok: true,
      message: result.message,
      currentLocation: result.currentLocation,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Vehicle location update failed.",
    }, { status: 500 });
  }
}
