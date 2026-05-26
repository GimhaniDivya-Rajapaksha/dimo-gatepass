/**
 * Test the SAP /location PATCH for a Location Transfer vehicle.
 *
 * Usage:
 *   npx tsx scripts/test-sap-location-patch.ts
 *     → lists all /in (mmsta=QP30) vehicles with their current plant location
 *
 *   npx tsx scripts/test-sap-location-patch.ts <internalNo> <targetPlant> <targetSloc>
 *     → sends the location update and prints the SAP response
 *
 * Example:
 *   npx tsx scripts/test-sap-location-patch.ts 1059 1108 D001
 */
import { readFileSync } from "fs";
import { join } from "path";
// Load .env.local (Next.js convention) then .env as fallback
for (const name of [".env.local", ".env"]) {
  try {
    const content = readFileSync(join(process.cwd(), name), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* file not found — skip */ }
}

const APIM_BASE = "https://gatepassproxy.azure-api.net";
const APIM_KEY = process.env.SAP_APIM_KEY ?? "";

if (!APIM_KEY) {
  console.error("❌  SAP_APIM_KEY is not set in .env");
  process.exit(1);
}

type Row = Record<string, unknown>;

function s(v: unknown) { return v == null ? "" : String(v).trim(); }

function sapDate(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

async function fetchIn(): Promise<Row[]> {
  const res = await fetch(`${APIM_BASE}/dimogatepass/in`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": APIM_KEY,
    },
    body: JSON.stringify({ filter: "mmsta eq 'QP30'" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`/in API ${res.status}: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { data?: Row[] };
  return json.data ?? [];
}

async function fetchPlant(): Promise<Row[]> {
  const res = await fetch(`${APIM_BASE}/dimogatepass/plant`, {
    method: "GET",
    headers: { Accept: "application/json", "Ocp-Apim-Subscription-Key": APIM_KEY },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`/plant API ${res.status}: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { data?: Row[] } | Row[];
  return Array.isArray(json) ? json : (json.data ?? []);
}

async function inspectPlantFields(searchVin: string) {
  console.log(`\n🔬  Inspecting raw /plant JSON fields for VIN: ${searchVin}\n`);
  const res = await fetch(`${APIM_BASE}/dimogatepass/plant`, {
    method: "GET",
    headers: { Accept: "application/json", "Ocp-Apim-Subscription-Key": APIM_KEY },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`/plant API ${res.status}`);
  const json = (await res.json()) as { data?: Row[] } | Row[];
  const rows: Row[] = Array.isArray(json) ? json : (json.data ?? []);
  const needle = searchVin.toUpperCase();
  const matches = rows.filter((r) =>
    Object.values(r).some((v) => String(v ?? "").toUpperCase().includes(needle))
  );
  if (matches.length === 0) {
    console.log("❌  No rows contain this VIN in any field.");
    console.log("    First row field names:", rows[0] ? Object.keys(rows[0]).join(", ") : "(no rows)");
  } else {
    console.log(`Found ${matches.length} matching row(s):`);
    matches.forEach((r, i) => {
      console.log(`\n  Row ${i + 1}:`);
      Object.entries(r).forEach(([k, v]) => {
        if (v != null && String(v).trim()) console.log(`    ${k}: ${v}`);
      });
    });
  }
}

async function patchLocation(payload: Record<string, string>) {
  console.log("\n📤  Sending payload to SAP /location:");
  console.log(JSON.stringify(payload, null, 2));

  const res = await fetch(`${APIM_BASE}/dimogatepass/location/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": APIM_KEY,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

  console.log(`\n📥  SAP response — HTTP ${res.status}:`);
  console.log(JSON.stringify(parsed, null, 2));

  const row: Row = Array.isArray(parsed) ? (parsed[0] ?? {}) : ((parsed as Row) ?? {});
  const message = s(row["Message"] ?? row["message"]);
  const msgType = s(row["MsgType"] ?? row["Msgtype"] ?? row["msgtype"]).toUpperCase();

  if (res.ok && msgType !== "E" && msgType !== "A") {
    console.log(`\n✅  SUCCESS — ${message || "Location updated."}`);
  } else {
    console.log(`\n❌  FAILED — ${message || "SAP returned an error."} (MsgType: ${msgType || "?"})`);
  }
}

async function main() {
  const [, , internalNoArg, targetPlant, targetSloc] = process.argv;

  // ── MODE 3: inspect raw /plant fields for a given VIN ────────────────────────
  if (internalNoArg && !targetPlant) {
    await inspectPlantFields(internalNoArg);
    return;
  }

  // ── MODE 2: perform the patch then verify ────────────────────────────────────
  if (internalNoArg && targetPlant && targetSloc) {
    // 1. Snapshot current location before patch
    console.log("🔍  Checking current location in /plant BEFORE patch …");
    const plantBefore = await fetchPlant();
    const beforeRow = plantBefore.find((r) => s(r["Vhcle"]).toUpperCase() === internalNoArg.toUpperCase());
    if (beforeRow) {
      console.log(`    Current: plant=${s(beforeRow["Werks"])}  sloc=${s(beforeRow["Lgort"])}  desc=${s(beforeRow["LgortDesc"])}`);
    } else {
      console.log("    ⚠️  Vehicle NOT found in /plant before patch (unexpected).");
    }

    // 2. Send the location patch
    const today = sapDate();
    const payload: Record<string, string> = {
      Vhcle: internalNoArg,
      Umwerks: targetPlant,
      Umlgo: targetSloc,
      Bldat: today,
      Budat: today,
    };
    await patchLocation(payload);

    // 3. Re-fetch /plant and verify vehicle is still present with new location
    console.log("\n🔍  Re-checking /plant AFTER patch …");
    const plantAfter = await fetchPlant();
    const afterRow = plantAfter.find((r) => s(r["Vhcle"]).toUpperCase() === internalNoArg.toUpperCase());

    if (!afterRow) {
      console.log("    ❌  Vehicle is NO LONGER present in /plant after patch.");
      console.log("        SAP may have removed it or the internal no changed.");
    } else {
      const newPlant = s(afterRow["Werks"]);
      const newSloc  = s(afterRow["Lgort"]);
      const newDesc  = s(afterRow["LgortDesc"]);
      const plantOk  = newPlant === targetPlant;
      const slocOk   = newSloc  === targetSloc;
      console.log(`    After:  plant=${newPlant}  sloc=${newSloc}  desc=${newDesc}`);
      if (plantOk && slocOk) {
        console.log("    ✅  Vehicle still in /plant with CORRECT new location.");
      } else {
        console.log(`    ⚠️  Vehicle still in /plant but location mismatch — expected plant=${targetPlant} sloc=${targetSloc}`);
      }
    }
    return;
  }

  // ── MODE 1: list /in vehicles + their current plant location ─────────────────
  console.log("Fetching Location Transfer vehicles from SAP /in (mmsta=QP30) …\n");

  const [inRows, plantRows] = await Promise.all([fetchIn(), fetchPlant()]);

  // Build plant lookup: internalNo → plant row
  const plantByInternal = new Map<string, Row>();
  const plantByChassis  = new Map<string, Row>();
  for (const r of plantRows) {
    const vhcle = s(r["Vhcle"]);
    const vhvin = s(r["Vhvin"]);
    if (vhcle) plantByInternal.set(vhcle.toUpperCase(), r);
    if (vhvin) plantByChassis.set(vhvin.toUpperCase(), r);
  }

  if (inRows.length === 0) {
    console.log("No vehicles found in /in with mmsta=QP30.");
    return;
  }

  console.log(`Found ${inRows.length} vehicle(s) eligible for Location Transfer:\n`);

  console.log(
    "#".padEnd(4),
    "Internal No".padEnd(14),
    "External No".padEnd(16),
    "Chassis (VIN)".padEnd(22),
    "Licence Plate".padEnd(16),
    "Current Plant".padEnd(8),
    "Current Sloc".padEnd(10),
    "Plant Description".padEnd(35),
    "Sloc Description",
  );
  console.log("-".repeat(160));

  inRows.forEach((r, i) => {
    const vhcle = s(r["vhcle"]);
    const vhcex = s(r["vhcex"]);
    const vhvin = s(r["vhvin"]);
    const plate = s(r["xdbexlicext"]);

    const pr = plantByInternal.get(vhcle.toUpperCase()) ?? plantByChassis.get(vhvin.toUpperCase());
    const plant     = pr ? s(pr["Werks"]) : "—";
    const sloc      = pr ? s(pr["Lgort"]) : "—";
    const plantDesc = pr ? s(pr["name1"] ?? pr["Name1"]) : "—";
    const slocDesc  = pr ? s(pr["LgortDesc"]) : "—";

    console.log(
      String(i + 1).padEnd(4),
      vhcle.padEnd(14),
      vhcex.padEnd(16),
      vhvin.padEnd(22),
      plate.padEnd(16),
      plant.padEnd(8),
      sloc.padEnd(10),
      plantDesc.slice(0, 33).padEnd(35),
      slocDesc,
    );
  });

  console.log(`
──────────────────────────────────────────────────────────────────
To test a location patch, run:

  npx tsx scripts/test-sap-location-patch.ts <InternalNo> <TargetPlant> <TargetSloc>

Example (move internal no 1059 to plant 1108 sloc D001):

  npx tsx scripts/test-sap-location-patch.ts 1059 1108 D001
──────────────────────────────────────────────────────────────────`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
