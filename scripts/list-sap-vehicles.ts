/**
 * Run with:  npx tsx scripts/list-sap-vehicles.ts
 *
 * Prints vehicles from the SAP /plant endpoint so you can pick test vehicles.
 * Requires SAP_APIM_KEY in .env (loaded automatically via dotenv).
 */
import "dotenv/config";

const APIM_BASE = "https://gatepassproxy.azure-api.net";
const APIM_KEY = process.env.SAP_APIM_KEY ?? "";

if (!APIM_KEY) {
  console.error("❌  SAP_APIM_KEY is not set in .env");
  process.exit(1);
}

async function main() {
  console.log("Fetching vehicles from SAP /plant ...\n");

  const res = await fetch(`${APIM_BASE}/dimogatepass/plant`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": APIM_KEY,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`❌  Plant API ${res.status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }

  type Row = Record<string, unknown>;
  const json = (await res.json()) as { data?: Row[] } | Row[];
  const rows: Row[] = Array.isArray(json) ? json : (json.data ?? []);

  function s(v: unknown) { return v == null ? "" : String(v).trim(); }

  // Deduplicate by internal vehicle number
  const seen = new Set<string>();
  const vehicles = rows
    .map((r) => ({
      internalNo:       s(r["Vhcle"]),
      externalNo:       s(r["Vhcex"]),
      chassisNo:        s(r["Vhvin"]),
      materialNo:       s(r["Matnr"]),
      plantCode:        s(r["Werks"]),
      plantDescription: s(r["name1"] ?? r["Name1"]),
      sloc:             s(r["Lgort"]),
      slocDesc:         s(r["LgortDesc"]),
    }))
    .filter((v) => {
      const key = v.internalNo || v.chassisNo || v.externalNo;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (vehicles.length === 0) {
    console.log("No vehicles returned from /plant.");
    return;
  }

  console.log(`Found ${vehicles.length} unique vehicle(s):\n`);
  console.log(
    "Internal No".padEnd(12),
    "External No".padEnd(16),
    "Chassis No".padEnd(22),
    "Plant".padEnd(6),
    "Plant Description".padEnd(35),
    "Sloc".padEnd(8),
    "Sloc Description",
  );
  console.log("-".repeat(130));

  for (const v of vehicles) {
    console.log(
      v.internalNo.padEnd(12),
      v.externalNo.padEnd(16),
      v.chassisNo.padEnd(22),
      v.plantCode.padEnd(6),
      v.plantDescription.slice(0, 33).padEnd(35),
      v.sloc.padEnd(8),
      v.slocDesc,
    );
  }

  // Also print vehicles that appear in /in (mmsta=QP30 — Location Transfer eligible)
  console.log("\n\nFetching vehicles from SAP /in (mmsta=QP30 — Location Transfer) ...\n");
  const inRes = await fetch(`${APIM_BASE}/dimogatepass/in`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": APIM_KEY,
    },
    body: JSON.stringify({ filter: "mmsta eq 'QP30'" }),
    signal: AbortSignal.timeout(20_000),
  });

  if (inRes.ok) {
    const inJson = (await inRes.json()) as { data?: Row[] };
    const inRows = inJson.data ?? [];
    console.log(`/in returned ${inRows.length} row(s):`);
    for (const r of inRows.slice(0, 20)) {
      console.log(
        `  internalNo=${s(r["vhcle"])} externalNo=${s(r["vhcex"])} chassisNo=${s(r["vhvin"])} licencePlate=${s(r["xdbexlicext"])} mmsta=${s(r["mmsta"])}`,
      );
    }
  } else {
    console.warn("/in API error:", inRes.status);
  }

  // Also print vehicles that appear in /out (sdsta=QS60 — Customer Delivery eligible)
  console.log("\n\nFetching vehicles from SAP /out (sdsta=QS60 — Customer Delivery) ...\n");
  const outRes = await fetch(`${APIM_BASE}/dimogatepass/out`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": APIM_KEY,
    },
    body: JSON.stringify({ filter: "sdsta eq 'QS60'" }),
    signal: AbortSignal.timeout(20_000),
  });

  if (outRes.ok) {
    const outJson = (await outRes.json()) as { data?: Row[] };
    const outRows = outJson.data ?? [];
    console.log(`/out returned ${outRows.length} row(s):`);
    for (const r of outRows.slice(0, 20)) {
      console.log(
        `  internalNo=${s(r["vhcle"])} externalNo=${s(r["vhcex"])} chassisNo=${s(r["vhvin"])} licencePlate=${s(r["xdbexlicext"])} sdsta=${s(r["sdsta"])}`,
      );
    }
  } else {
    console.warn("/out API error:", outRes.status);
  }
}

main().catch(console.error);
