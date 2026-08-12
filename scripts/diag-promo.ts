import { fetchPlantVehicleRows, filterApiLocations, type LocationOption } from "../lib/location-api";

async function main() {
  const chassisNo = "W1K2050761212124";
  const allRows = await fetchPlantVehicleRows().catch((e) => { console.log("fetchPlantVehicleRows failed:", e.message); return []; });
  console.log("Total rows from fetchPlantVehicleRows():", allRows.length);

  const vehicleRows = allRows.filter(r => r.chassisNo.toUpperCase() === chassisNo.toUpperCase());
  console.log("Rows matching chassisNo:", vehicleRows.length);

  const seen = new Set<string>();
  const options: LocationOption[] = [];
  for (const row of vehicleRows) {
    if (!row.extPlant || !row.extSloc) continue;
    const id = `${row.extPlant}|${row.extSloc}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const plantDesc = row.extPlantDesc || row.extPlant;
    const slocDesc  = row.extSlocDesc  || row.extSloc;
    options.push({
      id, value: `${plantDesc} - ${slocDesc}`, label: `${plantDesc} - ${slocDesc}`,
      plantCode: row.extPlant, plantDescription: plantDesc,
      storageLocation: row.extSloc, storageDescription: slocDesc,
      source: "api",
    });
  }
  console.log("Built options:", options.length);
  console.log(options);

  const filtered = filterApiLocations(options, "", "PROMOTION");
  console.log("Filtered PROMOTION options:", filtered.length);
  console.log(filtered);
}
main();
