import { prisma } from "@/lib/prisma";
import { fetchPlantVehicleRows } from "@/lib/location-api";

// Backs the Admin "Select Locations" / "Mapped Plants" picker (User Management) only.
// Deliberately separate from LocationOption, which is keyed by real SAP plant/storage codes
// and used as a live SAP-write fallback for Location Transfer — this table stores label text
// only, so a stale or manually-adjusted row here can never affect a SAP write.
export async function getCachedAdminLocations(): Promise<{ locations: string[]; plants: string[] }> {
  const rows = await prisma.adminLocationCache.findMany({
    orderBy: [{ plantDescription: "asc" }, { storageDescription: "asc" }],
  });

  const locations = rows.map((r) => `${r.plantDescription} - ${r.storageDescription}`);

  const plantSeen = new Set<string>();
  const plants: string[] = [];
  for (const r of rows) {
    if (!plantSeen.has(r.plantDescription)) {
      plantSeen.add(r.plantDescription);
      plants.push(r.plantDescription);
    }
  }

  return { locations, plants };
}

// Fetches SAP /plant live (same function LT/CD/vehicle-report already use) and replaces the
// admin location cache with whatever plant/storage description pairs it finds. Only ever
// called from an explicit admin-triggered "Refresh from SAP" action — never on a normal page
// load — so a slow/flaky SAP response only affects the admin doing the refresh, not the
// picker's everyday availability.
export async function refreshAdminLocationsFromSap(): Promise<{ count: number }> {
  const rows = await fetchPlantVehicleRows();

  const seen = new Set<string>();
  const pairs: { plantDescription: string; storageDescription: string }[] = [];
  for (const r of rows) {
    if (r.plantDescription && r.storageDescription) {
      const key = `${r.plantDescription}|${r.storageDescription}`;
      if (!seen.has(key)) { seen.add(key); pairs.push({ plantDescription: r.plantDescription, storageDescription: r.storageDescription }); }
    }
    if (r.extPlantDesc && r.extSlocDesc) {
      const key = `${r.extPlantDesc}|${r.extSlocDesc}`;
      if (!seen.has(key)) { seen.add(key); pairs.push({ plantDescription: r.extPlantDesc, storageDescription: r.extSlocDesc }); }
    }
  }

  await prisma.$transaction([
    prisma.adminLocationCache.deleteMany({}),
    ...pairs.map((p) =>
      prisma.adminLocationCache.create({ data: p })
    ),
  ]);

  return { count: pairs.length };
}
