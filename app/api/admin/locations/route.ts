import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchPlantLocationOptions } from "@/lib/location-api";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const locations = await fetchPlantLocationOptions().catch(() => []);
    return NextResponse.json({
      locations: locations.map((location) => location.value).filter(Boolean).sort(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ locations: [] });
  }
}
