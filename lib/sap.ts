/**
 * SAP OData client — DIMO Gate Pass integration
 *
 * Azure APIM Proxy (internet-accessible, POST-based):
 *   /dimogatepass/in     → Gate IN vehicles  (mmsta = 'QP30' — PO Created)
 *   /dimogatepass/out    → Gate OUT vehicles (sdsta = 'QS60' — Sales Order Completed)
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
  const url = `${APIM_BASE}/dimogatepass/${endpoint}`;

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

/**
 * Build OData filter string for vehicle search.
 *  - With query q: search by VIN, license plate, or external number (partial match)
 *  - Without query:  apply the base status filter (mmsta/sdsta)
 */
function vehicleFilter(q: string, baseFilter: string): string {
  if (!q.trim()) return baseFilter;
  const safe = q.trim().replace(/'/g, "''");
  return (
    `substringof('${safe}',vhvin) or ` +
    `substringof('${safe}',xdbexlicext) or ` +
    `substringof('${safe}',vhcex)`
  );
}

/**
 * Search vehicles from SAP via Azure APIM proxy.
 *
 * passType = "LOCATION_TRANSFER" → /in  (mmsta eq 'QP30' — PO Created)
 * passType = "CUSTOMER_DELIVERY" → /out (sdsta eq 'QS60' — Sales Order Completed)
 * passType = "both"              → both endpoints in parallel, deduplicated by VIN
 */
export async function fetchSapVehicles(
  q: string,
  passType: "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "both" = "both"
): Promise<SapVehicle[]> {

  const fetchIN = () =>
    apimPost("in", vehicleFilter(q, "mmsta eq 'QP30'"))
      .then((rows) => rows.map(mapVehicle));

  const fetchOUT = () =>
    apimPost("out", vehicleFilter(q, "sdsta eq 'QS60'"))
      .then((rows) => rows.map(mapVehicle));

  let raw: SapVehicle[];

  if (passType === "LOCATION_TRANSFER") {
    raw = await fetchIN();
  } else if (passType === "CUSTOMER_DELIVERY") {
    raw = await fetchOUT();
  } else {
    // Both in parallel
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

  // Only return vehicles that have at least a license plate or VIN — these are identifiable for a gate pass
  return [...seen.values()].filter((v) => v.vehicleNo || v.chassisNo);
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

  try {
    const rows = await apimPost("order", filter);
    return rows.map(mapOrder).filter((o) => o.orderId);
  } catch (err) {
    console.error("[SAP] fetchSapOrders error:", err);
    return [];
  }
}
