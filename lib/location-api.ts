const APIM_BASE = "https://gatepassproxy.azure-api.net";
const APIM_KEY = process.env.SAP_APIM_KEY ?? "";
// Defaults to "qa" (unchanged behavior) unless SAP_APIM_ENV is explicitly set — e.g. "dev"
// for local/Dev-branch use, without affecting QA/Prod deployments that never set it.
const APIM_ENV = process.env.SAP_APIM_ENV || "qa";

export type LocationOption = {
  id: string;
  value: string;
  label: string;
  plantCode: string;
  plantDescription: string;
  storageLocation: string;
  storageDescription: string;
  source: "api" | "db";
};

type PlantApiRow = Record<string, unknown>;

export type PlantVehicleRow = {
  id: string;
  internalNo: string;
  externalNo: string;
  chassisNo: string;
  materialNo: string;
  plantCode: string;
  plantDescription: string;
  storageLocation: string;
  storageDescription: string;
  vehicleGuid: string;
  moduleGuid: string;
  modelCode: string;
  extPlant: string;
  extSloc: string;
  extPlantDesc: string;
  extSlocDesc: string;
};

export type PlantLocationTarget = {
  plantCode: string;
  plantDescription: string;
  storageLocation: string;
  storageDescription: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sapPostingDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function formatPlantLocationLabel(input: { plantDescription?: string | null; storageDescription?: string | null }) {
  return [str(input.plantDescription), str(input.storageDescription)].filter(Boolean).join(" - ");
}

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function pick(row: PlantApiRow, ...keys: string[]): string {
  for (const key of keys) {
    // Try PascalCase (Vhcle), lowercase (vhcle), UPPERCASE (VHCLE) — SAP varies
    for (const k of [key, key.toLowerCase(), key.toUpperCase()]) {
      if (k in row) {
        const value = str(row[k]);
        if (value) return value;
      }
    }
  }
  return "";
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (APIM_KEY) headers["Ocp-Apim-Subscription-Key"] = APIM_KEY;
  return headers;
}

function buildJsonHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (APIM_KEY) headers["Ocp-Apim-Subscription-Key"] = APIM_KEY;
  return headers;
}

function inferType(option: LocationOption): "PROMOTION" | "FINANCE" | "DEALER" | "DIMO" {
  // D-prefix storageLocation = Dealer allocation (D001..D047)
  if (option.storageLocation.toUpperCase().startsWith("D")) return "DEALER";
  // S-prefix: classify by exact SAP LgortDesc (storageDescription only — never plantDescription)
  const desc = option.storageDescription.trim().toLowerCase();
  if (desc === "promo location") return "PROMOTION";
  if (desc === "finan institute" || desc === "financial instit" || desc === "financial institute") return "FINANCE";
  // All other S-prefix locations (vehicle parks, showrooms, TATA Parts, oil stores, etc.) → DIMO
  return "DIMO";
}

export function filterApiLocations(
  options: LocationOption[],
  query = "",
  locationType?: string
): LocationOption[] {
  const normalizedQuery = query.trim().toLowerCase();

  let filtered = options;

  if (locationType === "PROMOTION" || locationType === "FINANCE" || locationType === "DEALER") {
    filtered = filtered.filter((option) => inferType(option) === locationType);
  } else if (locationType === "DIMO") {
    filtered = filtered.filter((option) => inferType(option) === "DIMO");
  }

  if (!normalizedQuery) return filtered;

  return filtered.filter((option) => {
    const haystack = [
      option.value,
      option.label,
      option.plantCode,
      option.plantDescription,
      option.storageLocation,
      option.storageDescription,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export async function fetchPlantLocationOptions(vehicleFilter?: string): Promise<LocationOption[]> {
  const rows = await fetchPlantVehicleRows(vehicleFilter);
  const seen = new Set<string>();
  const options: LocationOption[] = [];

  for (const row of rows) {
    // ext_plant/ext_sloc are the valid transfer destination codes.
    // Werks/Lgort is the vehicle's current location — dealer D-prefix codes only appear in ext_sloc.
    const plantCode = row.extPlant;
    const plantDescription = row.extPlantDesc;
    const storageLocation = row.extSloc;
    const storageDescription = row.extSlocDesc || row.extSloc;

    if (!plantCode || !storageLocation || !plantDescription) continue;

    const value = [plantDescription, storageDescription].filter(Boolean).join(" - ");
    const id = [plantCode, storageLocation, plantDescription, storageDescription].join("|");
    if (!value || seen.has(id)) continue;

    seen.add(id);
    options.push({
      id,
      value,
      label: value,
      plantCode,
      plantDescription,
      storageLocation,
      storageDescription,
      source: "api",
    });
  }

  return options.sort((a, b) =>
    a.plantCode.localeCompare(b.plantCode) ||
    a.plantDescription.localeCompare(b.plantDescription) ||
    a.storageDescription.localeCompare(b.storageDescription)
  );
}

export function findPlantLocationOption(
  options: Array<LocationOption | PlantLocationTarget>,
  label: string | null | undefined
): PlantLocationTarget | null {
  const normalized = str(label).toLowerCase();
  if (!normalized) return null;

  for (const option of options) {
    const optionLabel = formatPlantLocationLabel(option).toLowerCase();
    if (optionLabel === normalized) {
      return {
        plantCode: str(option.plantCode),
        plantDescription: str(option.plantDescription),
        storageLocation: str(option.storageLocation),
        storageDescription: str(option.storageDescription),
      };
    }
  }

  return null;
}

export async function fetchPlantVehicleRows(vehicleFilter?: string): Promise<PlantVehicleRow[]> {
  // QAS requires OData-style filter: Vhvin eq 'value'
  const url = vehicleFilter
    ? `${APIM_BASE}/dimogatepass/${APIM_ENV}/plant?filter=${encodeURIComponent(`Vhvin eq '${vehicleFilter}'`)}`
    : `${APIM_BASE}/dimogatepass/${APIM_ENV}/plant`;
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plant API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: PlantApiRow[] } | PlantApiRow[];
  const rows = Array.isArray(json) ? json : (json.data ?? []);
  return rows.map((row) => ({
    id: [
      pick(row, "Vhcle"),
      pick(row, "Vhcex"),
      pick(row, "Vhvin"),
      pick(row, "Werks"),
      pick(row, "Lgort"),
      pick(row, "ext_plant"),
      pick(row, "ext_sloc"),
    ].join("|"),
    internalNo: pick(row, "Vhcle"),
    externalNo: pick(row, "Vhcex"),
    chassisNo: pick(row, "Vhvin"),
    materialNo: pick(row, "Matnr"),
    plantCode: pick(row, "Werks"),
    plantDescription: pick(row, "name1", "Name1"),
    storageLocation: pick(row, "Lgort"),
    storageDescription: pick(row, "LgortDesc"),
    vehicleGuid: pick(row, "Vguid"),
    moduleGuid: pick(row, "Modguid"),
    modelCode: pick(row, "Mcodecs"),
    extPlant: pick(row, "ext_plant"),
    extSloc: pick(row, "ext_sloc"),
    extPlantDesc: pick(row, "ext_p_des"),
    extSlocDesc: pick(row, "ext_sloc_des"),
  }));
}

export function findPlantVehicleRow(rows: PlantVehicleRow[], identifiers: Array<string | null | undefined>): PlantVehicleRow | null {
  const normalized = identifiers
    .map((value) => str(value).toUpperCase())
    .filter(Boolean);

  if (normalized.length === 0) return null;

  const exact = rows.find((row) => {
    const keys = [row.internalNo, row.externalNo, row.chassisNo].map((value) => value.toUpperCase()).filter(Boolean);
    return normalized.some((target) => keys.includes(target));
  });

  if (exact) return exact;

  return rows.find((row) => {
    const haystack = [row.internalNo, row.externalNo, row.chassisNo].map((value) => value.toUpperCase()).filter(Boolean);
    return normalized.some((target) => haystack.some((value) => value.includes(target) || target.includes(value)));
  }) ?? null;
}

export async function updateVehiclePlantLocation(params: {
  identifiers: Array<string | null | undefined>;
  destination: PlantLocationTarget;
  plantRows?: PlantVehicleRow[];
  // Typed SAP identifiers used as fallback when the vehicle is no longer in /plant
  // (SAP removes vehicles from /plant after a location transfer is processed).
  sapFallback?: {
    internalNo?: string | null;
    externalNo?: string | null;
    chassisNo?: string | null;
  };
}) {
  // Use chassis/fallback as filter so /plant returns only this vehicle (fast, gets correct Vhcle)
  const filterHint = str(params.sapFallback?.chassisNo) || params.identifiers.map(str).filter(Boolean)[0] || undefined;
  const rows = params.plantRows ?? await fetchPlantVehicleRows(filterHint);
  let vehicleRow = findPlantVehicleRow(rows, params.identifiers);

  if (!vehicleRow) {
    // Vehicle not in /plant — SAP removes vehicles from the endpoint after processing
    // a location transfer. Build a synthetic row from the known SAP identifiers so we
    // can still POST to /location without requiring the vehicle to be in /plant.
    const fb = params.sapFallback;
    const internalNo = str(fb?.internalNo);
    const externalNo = str(fb?.externalNo);
    const chassisNo  = str(fb?.chassisNo);
    if (!internalNo && !externalNo && !chassisNo) {
      throw new Error("Vehicle was not found in the live plant API.");
    }
    vehicleRow = {
      id: "", internalNo, externalNo, chassisNo,
      materialNo: "", plantCode: "", plantDescription: "",
      storageLocation: "", storageDescription: "",
      vehicleGuid: "", moduleGuid: "", modelCode: "",
      extPlant: "", extSloc: "", extPlantDesc: "", extSlocDesc: "",
    };
  }

  // SAP /location requires exact lowercase field names — Umwerks / Umlgo (not UmWerks / UmLgo).
  // Using the wrong casing causes SAP to misinterpret the payload and change the vehicle status.
  // Always resolve Vhcle (internal no) from /plant and use it as the sole identifier.
  const destinationPayload = {
    Umwerks: params.destination.plantCode,
    Umlgo: params.destination.storageLocation,
    Bldat: sapPostingDate(),
    Budat: sapPostingDate(),
  };

  // Use Vhcle only — sending Vhvin or Vhcex triggers a different SAP transaction
  // that changes the vehicle status as a side effect.
  const resolvedRow = vehicleRow as PlantVehicleRow;
  const uniquePayloadCandidates: Record<string, string>[] = [];
  if (resolvedRow.internalNo) {
    uniquePayloadCandidates.push({ Vhcle: resolvedRow.internalNo, ...destinationPayload });
  } else if (resolvedRow.chassisNo) {
    // Fallback only when Vhcle is unavailable
    uniquePayloadCandidates.push({ Vhvin: resolvedRow.chassisNo, ...destinationPayload });
  } else if (resolvedRow.externalNo) {
    uniquePayloadCandidates.push({ Vhcex: resolvedRow.externalNo, ...destinationPayload });
  }

  let lastMessage = "Vehicle location update failed.";
  let lastStatus = 0;
  const url = `${APIM_BASE}/dimogatepass/${APIM_ENV}/location/`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    for (const payload of uniquePayloadCandidates) {
      console.log(`[SAP /location] attempt ${attempt} payload:`, JSON.stringify(payload));
      const res = await fetch(url, {
        method: "POST",
        headers: buildJsonHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });

      const text = await res.text().catch(() => "");
      let rawParsed: unknown = null;
      try {
        rawParsed = text ? JSON.parse(text) : null;
      } catch {
        rawParsed = null;
      }
      // SAP /location API returns either [{...}] or {...}
      const parsed: Record<string, unknown> | null = Array.isArray(rawParsed)
        ? ((rawParsed[0] as Record<string, unknown>) ?? null)
        : (rawParsed as Record<string, unknown> | null);

      const message =
        str(parsed?.Message) ||
        str(parsed?.message) ||
        str((parsed?.error as Record<string, unknown> | undefined)?.message) ||
        (res.ok ? "Vehicle location updated." : "Vehicle location update failed.");
      console.log(`[SAP /location] attempt ${attempt} response status:`, res.status, "body:", JSON.stringify(parsed));
      // SAP uses "MsgType" (capital M and T) — check all casings
      const msgType = str(parsed?.MsgType || parsed?.Msgtype || parsed?.msgtype).toUpperCase();
      const sapBusinessError = msgType === "E" || msgType === "A";

      if (res.ok && !sapBusinessError) {
        return {
          message: attempt === 1 ? message : `${message} (succeeded after retry ${attempt})`,
          currentLocation: {
            plantCode: params.destination.plantCode,
            plantDescription: params.destination.plantDescription,
            storageLocation: params.destination.storageLocation,
            storageDescription: params.destination.storageDescription,
            label: formatPlantLocationLabel(params.destination),
          },
        };
      }

      lastMessage = message;
      lastStatus = sapBusinessError ? 400 : res.status;

      const shouldRetry = !sapBusinessError && (res.status >= 500 || /noresponse|upstream|timeout|temporar/i.test(message));
      if (!shouldRetry) {
        throw new Error(lastStatus ? `${lastMessage} (status ${lastStatus})` : lastMessage);
      }
    }

    if (attempt < 3) {
      await sleep(attempt * 1500);
    }
  }

  throw new Error(lastStatus ? `${lastMessage} (status ${lastStatus})` : lastMessage);
}
