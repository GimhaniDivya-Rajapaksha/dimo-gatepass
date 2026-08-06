/**
 * SAP OData client — DIMO Gate Pass integration
 *
 * Azure APIM Proxy (internet-accessible, POST-based):
 *   /dimogatepass/in     → Gate IN vehicles  (mmsta = 'QP30' — PO Created)
 *   /dimogatepass/out    → Gate OUT vehicles (sdsta in QS60/QS50/QS5X/QS40/QS4X per new FS §2.2)
 *   /dimogatepass/inout  → Gate IN-OUT invoices (filter by vbeln)
 *   /dimogatepass/order  → Orders for cashier review (filter by vhcle / vhvin)
 *
 * Request:  POST  Content-Type: application/json  Ocp-Apim-Subscription-Key: <key>
 * Body:     { "filter": "<OData filter expression>" }
 * Response: { "data": [ { ...fields (all lowercase) } ] }
 */

const APIM_BASE = "https://gatepassproxy.azure-api.net";
const APIM_KEY  = process.env.SAP_APIM_KEY ?? "";

function apimHeaders(): Record<string, string> {
  return {
    "Content-Type":               "application/json",
    "Ocp-Apim-Subscription-Key":  APIM_KEY,
  };
}

// ── Raw POST helper ───────────────────────────────────────────────────────────

async function apimPost(
  endpoint: string,
  filter: string
): Promise<Record<string, unknown>[]> {
  const url = `${APIM_BASE}/dimogatepass/qa/${endpoint}`;

  const res = await fetch(url, {
    method:  "POST",
    headers: apimHeaders(),
    body:    JSON.stringify({ filter }),
    signal:  AbortSignal.timeout(12_000),
    cache:   "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`APIM ${endpoint} ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  return json?.data ?? [];
}

// ── Field helper ──────────────────────────────────────────────────────────────
// All response fields from the Azure proxy are lowercase.

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

// ── Vehicle types ─────────────────────────────────────────────────────────────

export type SapVehicle = {
  vehicleNo:       string;  // License plate   — xdbexlicext
  chassisNo:       string;  // VIN             — vhvin
  internalNo:      string;  // Internal SAP no — vhcle
  externalNo:      string;  // External no     — vhcex
  make:            string;  // Make code       — vmake
  model:           string;  // Full model text — text1  (e.g. "TATA ACE HT BSIV Diesel Cargo Truck")
  colour:          string;  // Exterior colour — optext1 (e.g. "Azure Blue")
  primaryStatus:   string;  // mmsta
  secondaryStatus: string;  // sdsta
  statusDesc:      string;  // statut
  plantName:       string;  // Plant description — name1
  storageName:     string;  // Storage description — lgobe
};

function mapVehicle(row: Record<string, unknown>): SapVehicle {
  return {
    vehicleNo:       str(row["xdbexlicext"]),
    chassisNo:       str(row["vhvin"]),
    internalNo:      str(row["vhcle"]),
    externalNo:      str(row["vhcex"]),
    make:            str(row["vmake"]),
    model:           str(row["text1"]),
    colour:          str(row["optext1"]),
    primaryStatus:   str(row["mmsta"]),
    secondaryStatus: str(row["sdsta"]),
    statusDesc:      str(row["statut"]),
    plantName:       str(row["name1"]),
    storageName:     str(row["lgobe"]),
  };
}

// ── Order types ───────────────────────────────────────────────────────────────

export type SapOrder = {
  orderId:         string;   // vbeln
  docDate:         string;   // audat
  billingDate:     string;   // fkdat
  orderStatus:     string;   // bezei  (e.g. "Closed")
  orderStatusCode: string;   // hstat  (e.g. "H070")
  billingType:     string;   // fkart  (e.g. "ZSF2" = Workshop Invoice, "ZVVO" = Vehicle Sale)
  payTermCode:     string;   // zterm  (e.g. "ZC01")
  payTerm:         string;   // paymenttermsname  (e.g. "Payment Immediate")
  postingStatus:   string;   // buchk
  cancelled:       boolean;  // fksto  (boolean false / true, or "X" in older format)
  /** Happy path: hstat=H070, fkart in [ZSF2,ZVVO], zterm=ZC01, not cancelled */
  isHappyPath:     boolean;
};

function mapOrder(row: Record<string, unknown>): SapOrder {
  const hstat = str(row["hstat"]);
  const fkart = str(row["fkart"]);
  const zterm = str(row["zterm"]);

  // fksto can be: boolean false/true, string "false"/"true"/"X", or missing
  const fkstoRaw  = row["fksto"];
  const cancelled = fkstoRaw === true
    || fkstoRaw === "X"
    || fkstoRaw === "true"
    || fkstoRaw === "True";

  return {
    orderId:         str(row["vbeln"]),
    docDate:         str(row["audat"]),
    billingDate:     str(row["fkdat"]),
    orderStatus:     str(row["bezei"]),
    orderStatusCode: hstat,
    billingType:     fkart,
    payTermCode:     zterm,
    payTerm:         str(row["paymenttermsname"]),
    postingStatus:   str(row["buchk"]),
    cancelled,
    // Happy path per FS document §2.4
    isHappyPath:
      hstat === "H070" &&
      (fkart === "ZSF2" || fkart === "ZVVO") &&
      zterm === "ZC01" &&
      !cancelled,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function jsVehicleFilter(vehicles: SapVehicle[], q: string): SapVehicle[] {
  if (!q.trim()) return vehicles;
  const safe = q.trim().toUpperCase();
  return vehicles.filter((v) =>
    v.chassisNo.toUpperCase().includes(safe) ||
    v.vehicleNo.toUpperCase().includes(safe) ||
    v.externalNo.toUpperCase().includes(safe) ||
    v.internalNo.toUpperCase().includes(safe)
  );
}

// ── Location Transfer vehicle status allowlist ──────────────────────────────────
// Prefixes match ANY code starting with them (e.g. "QP*" matches QP03, QP60, QP99, ...).
const LT_STATUS_PREFIXES = ["QE", "QP", "QR", "QS", "QV", "VMM", "VMS"];
// Codes with no wildcard prefix given — matched literally only.
const LT_STATUS_EXACT = new Set(["INITIAL", "QT05", "QT10", "QT20", "QT30", "QT40"]);
// Customer Delivery's own statuses — must never appear in Location Transfer, even
// though they'd otherwise match the "QS" prefix above.
const LT_EXCLUDED_STATUSES = new Set(["QS40", "QS4X", "QS50", "QS5X", "QS60"]);

function isLocationTransferEligibleStatus(mmsta: string): boolean {
  const code = mmsta.trim().toUpperCase();
  if (!code) return false;
  if (LT_EXCLUDED_STATUSES.has(code)) return false;
  if (LT_STATUS_EXACT.has(code)) return true;
  return LT_STATUS_PREFIXES.some((prefix) => code.startsWith(prefix));
}

/**
 * Search vehicles from SAP via Azure APIM proxy.
 *
 * passType = "LOCATION_TRANSFER" → /in, filtered to the LT status allowlist (mmsta)
 * passType = "CUSTOMER_DELIVERY" → /out (sdsta eq 'QS60' — Sales Order Completed)
 * passType = "both"              → both endpoints in parallel, deduplicated by VIN
 */
export async function fetchSapVehicles(
  q: string,
  passType: "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "TEST_DRIVE" | "both" = "both"
): Promise<SapVehicle[]> {

  // Send chassis filter to SAP when query is >= 3 chars — reduces payload.
  // substringof matches anywhere in the VIN (prefix, middle, suffix all work).
  const chassisQ = q.trim().length >= 3 ? q.trim().replace(/'/g, "''") : null;

  const fetchIN = () =>
    apimPost("in", chassisQ ? `substringof('${chassisQ}', vhvin)` : "")
      .then((rows) => rows.map(mapVehicle));

  // New FS §2.2: accept QS60 (happy path) + QS50/QS5X/QS40/QS4X (intermediate invoice stages)
  const sdstaFilter = "sdsta eq 'QS60' or sdsta eq 'QS50' or sdsta eq 'QS5X' or sdsta eq 'QS40' or sdsta eq 'QS4X'";
  const fetchOUT = () =>
    apimPost("out", chassisQ ? `(${sdstaFilter}) and substringof('${chassisQ}', vhvin)` : sdstaFilter)
      .then((rows) => rows.map(mapVehicle));

  let raw: SapVehicle[];

  if (passType === "LOCATION_TRANSFER" || passType === "TEST_DRIVE") {
    // Test Drive reuses the exact same vehicle search/filter as Location Transfer.
    raw = (await fetchIN()).filter((v) => isLocationTransferEligibleStatus(v.primaryStatus));
  } else if (passType === "CUSTOMER_DELIVERY") {
    raw = await fetchOUT();
  } else {
    const [inRes, outRes] = await Promise.allSettled([fetchIN(), fetchOUT()]);
    raw = [];
    if (inRes.status  === "fulfilled") raw.push(...inRes.value);
    if (outRes.status === "fulfilled") raw.push(...outRes.value);
  }

  // Always deduplicate — prefer entry that has a license plate
  const seen = new Map<string, SapVehicle>();
  for (const v of raw) {
    const key = v.chassisNo || v.internalNo || v.vehicleNo;
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || (!existing.vehicleNo && v.vehicleNo)) seen.set(key, v);
  }

  const all = [...seen.values()].filter((v) => v.vehicleNo || v.chassisNo);
  return jsVehicleFilter(all, q);
}

/**
 * Fetch a single vehicle's current mmsta/sdsta from SAP's /in endpoint — used only to
 * decide whether a Location Transfer's SAP write should execute (see isSapWriteEligible).
 * Returns null if the vehicle isn't found or the lookup fails; callers must treat that as
 * "cannot confirm eligibility" and skip the SAP write rather than guess.
 */
export async function fetchVehicleSapStatus(vin: string): Promise<{ mmsta: string; sdsta: string } | null> {
  const safeVin = vin.trim();
  if (!safeVin) return null;
  try {
    const rows = await apimPost("in", `vhvin eq '${safeVin.replace(/'/g, "''")}'`);
    const row = rows[0];
    if (!row) return null;
    return { mmsta: str(row["mmsta"]), sdsta: str(row["sdsta"]) };
  } catch {
    return null;
  }
}

/**
 * SAP write eligibility rule for Location Transfer: only write to SAP when the vehicle's
 * current status is MMSTA=QP60 AND (SDSTA is blank OR SDSTA=QS20). Every other eligible
 * Location Transfer status still completes normally in the application — only the SAP
 * write itself is skipped.
 */
export function isSapWriteEligible(status: { mmsta: string; sdsta: string } | null): boolean {
  if (!status) return false;
  const mmsta = status.mmsta.trim().toUpperCase();
  const sdsta = status.sdsta.trim().toUpperCase();
  return mmsta === "QP60" && (sdsta === "" || sdsta === "QS20");
}

/**
 * Fetch service/sales orders for a vehicle from /order endpoint.
 *
 * Priority: internalNo (vhcle) → chassisNo (vhvin) → licencePlate (xdbexlicext)
 */
export async function fetchSapOrders(
  chassisNo:   string,
  licencePlate?: string,
  internalNo?:  string
): Promise<SapOrder[]> {
  let filter: string;

  if (internalNo) {
    filter = `vhcle eq '${internalNo.replace(/'/g, "''")}'`;
  } else if (chassisNo) {
    filter = `vhvin eq '${chassisNo.replace(/'/g, "''")}'`;
  } else if (licencePlate) {
    filter = `xdbexlicext eq '${licencePlate.replace(/'/g, "''")}'`;
  } else {
    return [];
  }

  const rows = await apimPost("order", filter);
  return rows.map(mapOrder).filter((o) => o.orderId);
}
