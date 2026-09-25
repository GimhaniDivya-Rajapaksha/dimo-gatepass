import { prisma } from "@/lib/prisma";
import { fetchPlantVehicleRows, fetchPlantRowsByMaterial, type PlantVehicleRow, type LocationOption } from "@/lib/location-api";

// ── SAP /plant local cache ──────────────────────────────────────────────────
// SAP's unfiltered /plant response is a full cross-join — one real vehicle repeats once per
// destination location in the whole system (100+ rows for a single chassis). This file is the
// only place that talks to the normalized PlantMaterial / PlantLocationNode /
// PlantMaterialDestination / PlantVehicleCache tables (see prisma/schema.prisma for the full
// rationale). It never touches lib/location-api.ts, which keeps every live-SAP call (including
// the Location Transfer eligibility check and the pre-write /plant fetch) completely unchanged.
//
// Read-only/UI data only — never used for /in, /out, SAP write-eligibility, or the live
// pre-write fetch inside updateVehiclePlantLocation.

type CachedVehicleWithDestinations = {
  chassisNo: string;
  internalNo: string;
  externalNo: string;
  materialNo: string;
  plantCode: string;
  plantDescription: string;
  storageLocation: string;
  storageDescription: string;
  vehicleGuid: string;
  moduleGuid: string;
  modelCode: string;
  material: {
    destinations: {
      location: {
        plantCode: string;
        storageLocation: string;
        plantDescription: string;
        storageDescription: string;
      };
    }[];
  } | null;
};

function toPlantVehicleRows(v: CachedVehicleWithDestinations): PlantVehicleRow[] {
  const destinations = v.material?.destinations ?? [];
  const base = {
    internalNo: v.internalNo,
    externalNo: v.externalNo,
    chassisNo: v.chassisNo,
    materialNo: v.materialNo,
    plantCode: v.plantCode,
    plantDescription: v.plantDescription,
    storageLocation: v.storageLocation,
    storageDescription: v.storageDescription,
    vehicleGuid: v.vehicleGuid,
    moduleGuid: v.moduleGuid,
    modelCode: v.modelCode,
  };

  if (destinations.length === 0) {
    // No known destinations yet for this vehicle's material — still emit one row so
    // current-location lookups (which don't need ext_plant/ext_sloc) keep working.
    return [{
      id: [v.internalNo, v.externalNo, v.chassisNo, v.plantCode, v.storageLocation, "", ""].join("|"),
      ...base,
      extPlant: "", extSloc: "", extPlantDesc: "", extSlocDesc: "",
    }];
  }

  return destinations.map((d) => ({
    id: [v.internalNo, v.externalNo, v.chassisNo, v.plantCode, v.storageLocation, d.location.plantCode, d.location.storageLocation].join("|"),
    ...base,
    extPlant: d.location.plantCode,
    extSloc: d.location.storageLocation,
    extPlantDesc: d.location.plantDescription,
    extSlocDesc: d.location.storageDescription,
  }));
}

const destinationInclude = {
  material: { include: { destinations: { include: { location: true } } } },
} as const;

/** All cached vehicle rows, re-expanded to the same shape fetchPlantVehicleRows() returns. */
export async function getCachedPlantRows(): Promise<PlantVehicleRow[]> {
  const vehicles = await prisma.plantVehicleCache.findMany({ include: destinationInclude });
  return vehicles.flatMap(toPlantVehicleRows);
}

/** Cached rows for one chassis only — cheap unique lookup, same shape as an exact-VIN /plant call. */
export async function getCachedPlantRowsForChassis(chassisNo: string): Promise<PlantVehicleRow[]> {
  const normalized = chassisNo.trim().toUpperCase();
  if (!normalized) return [];
  const vehicle = await prisma.plantVehicleCache.findUnique({
    where: { chassisNo: normalized },
    include: destinationInclude,
  });
  return vehicle ? toPlantVehicleRows(vehicle) : [];
}

/**
 * Cross-vehicle fallback by material code — every destination ever observed for this material,
 * read directly from the material→destination join table (no vehicle row scan needed). Used
 * only when a specific chassis isn't in the cache and no live fallback found it either.
 */
export async function getCachedDestinationsForMaterial(materialNo: string): Promise<PlantVehicleRow[]> {
  const material = await prisma.plantMaterial.findUnique({
    where: { materialNo },
    include: { destinations: { include: { location: true } } },
  });
  if (!material) return [];

  return material.destinations.map((d) => ({
    id: `material|${materialNo}|${d.location.plantCode}|${d.location.storageLocation}`,
    internalNo: "", externalNo: "", chassisNo: "", materialNo,
    plantCode: "", plantDescription: "", storageLocation: "", storageDescription: "",
    vehicleGuid: "", moduleGuid: "", modelCode: "",
    extPlant: d.location.plantCode,
    extSloc: d.location.storageLocation,
    extPlantDesc: d.location.plantDescription,
    extSlocDesc: d.location.storageDescription,
  }));
}

/** Same de-duplication fetchPlantLocationOptions() applies, sourced from the cache instead of live SAP. */
export async function getCachedPlantLocationOptions(): Promise<LocationOption[]> {
  const rows = await getCachedPlantRows();
  const seen = new Set<string>();
  const options: LocationOption[] = [];

  for (const row of rows) {
    const plantCode = row.extPlant;
    const plantDescription = row.extPlantDesc;
    const storageLocation = row.extSloc;
    const storageDescription = row.extSlocDesc || row.extSloc;
    if (!plantCode || !storageLocation || !plantDescription) continue;

    const value = [plantDescription, storageDescription].filter(Boolean).join(" - ");
    const id = [plantCode, storageLocation, plantDescription, storageDescription].join("|");
    if (!value || seen.has(id)) continue;

    seen.add(id);
    options.push({ id, value, label: value, plantCode, plantDescription, storageLocation, storageDescription, source: "api" });
  }

  return options.sort((a, b) =>
    a.plantCode.localeCompare(b.plantCode) ||
    a.plantDescription.localeCompare(b.plantDescription) ||
    a.storageDescription.localeCompare(b.storageDescription)
  );
}

export async function getLastPlantCacheSync() {
  return prisma.plantCacheSyncLog.findFirst({ orderBy: { startedAt: "desc" } });
}

export type PlantCacheAdminRow = {
  chassisNo: string;
  internalNo: string;
  externalNo: string;
  materialNo: string;
  plantDescription: string;
  storageDescription: string;
  destinations: { plantDescription: string; storageDescription: string }[];
  syncedAt: string;
};

/**
 * Admin-facing, searchable listing of what's actually in the cache right now — used only by
 * the Master Data "Plant/Material Cache" tab so an admin can see real content (not just row
 * counts) while testing, e.g. search by chassis/material to confirm a specific vehicle synced
 * and how many destinations it resolved to. Read-only, paginated; never used by any live
 * search/lookup path.
 */
export async function listPlantCacheForAdmin(params: { q?: string; take?: number }): Promise<{ rows: PlantCacheAdminRow[]; total: number }> {
  const q = params.q?.trim();
  const take = Math.min(Math.max(params.take ?? 50, 1), 200);

  const where = q
    ? {
        OR: [
          { chassisNo: { contains: q, mode: "insensitive" as const } },
          { internalNo: { contains: q, mode: "insensitive" as const } },
          { externalNo: { contains: q, mode: "insensitive" as const } },
          { materialNo: { contains: q, mode: "insensitive" as const } },
          { plantDescription: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [vehicles, total] = await Promise.all([
    prisma.plantVehicleCache.findMany({
      where,
      take,
      orderBy: { syncedAt: "desc" },
      include: { material: { include: { destinations: { include: { location: true } } } } },
    }),
    prisma.plantVehicleCache.count({ where }),
  ]);

  return {
    rows: vehicles.map((v) => ({
      chassisNo: v.chassisNo,
      internalNo: v.internalNo,
      externalNo: v.externalNo,
      materialNo: v.materialNo,
      plantDescription: v.plantDescription,
      storageDescription: v.storageDescription,
      destinations: (v.material?.destinations ?? [])
        .map((d) => ({ plantDescription: d.location.plantDescription, storageDescription: d.location.storageDescription }))
        .sort((a, b) => a.plantDescription.localeCompare(b.plantDescription) || a.storageDescription.localeCompare(b.storageDescription)),
      syncedAt: v.syncedAt.toISOString(),
    })),
    total,
  };
}

export type PlantCacheMaterialRow = {
  materialNo: string;
  vehicleCount: number;
  destinations: { plantDescription: string; storageDescription: string }[];
  lastSyncedAt: string | null;
};

/**
 * Admin-facing, material-grouped view of the cache — SAP's destination list is per-material
 * (every vehicle sharing a material shares the exact same destination set), so this is the more
 * useful default view: one row per material instead of one per chassis, with the full
 * destination list available to expand rather than just a count.
 */
export async function listPlantMaterialsForAdmin(params: { q?: string; take?: number }): Promise<{ rows: PlantCacheMaterialRow[]; total: number }> {
  const q = params.q?.trim();
  const take = Math.min(Math.max(params.take ?? 50, 1), 200);
  const where = q ? { materialNo: { contains: q, mode: "insensitive" as const } } : undefined;

  const [materials, total] = await Promise.all([
    prisma.plantMaterial.findMany({
      where,
      take,
      orderBy: { materialNo: "asc" },
      include: {
        destinations: { include: { location: true } },
        vehicles: { select: { syncedAt: true } },
        _count: { select: { vehicles: true } },
      },
    }),
    prisma.plantMaterial.count({ where }),
  ]);

  return {
    rows: materials.map((m) => ({
      materialNo: m.materialNo,
      vehicleCount: m._count.vehicles,
      destinations: m.destinations
        .map((d) => ({ plantDescription: d.location.plantDescription, storageDescription: d.location.storageDescription }))
        .sort((a, b) => a.plantDescription.localeCompare(b.plantDescription) || a.storageDescription.localeCompare(b.storageDescription)),
      lastSyncedAt: m.vehicles.length > 0
        ? m.vehicles.reduce((max, v) => (v.syncedAt > max ? v.syncedAt : max), m.vehicles[0].syncedAt).toISOString()
        : null,
    })),
    total,
  };
}

/**
 * Opportunistically caches one vehicle's live SAP result — used by the destination dropdown's
 * fallback (app/api/lookups/route.ts) when a chassis isn't in the cache yet, so the same
 * chassis doesn't need a live SAP call again next time. Upsert-only, never deletes anything —
 * a single vehicle's fresh data must never wipe out what a previous sync already cached.
 */
export async function cachePlantRowsForChassis(chassisNo: string, rows: PlantVehicleRow[]): Promise<void> {
  const first = rows[0];
  if (!first?.chassisNo) return;

  const materialNo = first.materialNo || null;
  const destinations = rows.filter((r) => r.extPlant && r.extSloc);

  // Deliberately NOT wrapped in an interactive $transaction: this is a best-effort cache
  // write (same philosophy as the one-by-one sync fallback — a partial write just means the
  // cache is incomplete, not corrupted, and the next lookup or sync fills the gap). Holding one
  // interactive transaction open across many sequential statements was found to drop mid-way
  // over the app's connection-pooled DATABASE_URL (PgBouncer transaction mode) — plain
  // sequential calls avoid that entirely, each one its own short-lived statement.
  let materialId: string | null = null;
  if (materialNo) {
    const material = await prisma.plantMaterial.upsert({
      where: { materialNo },
      update: {},
      create: { materialNo },
    });
    materialId = material.id;
  }

  for (const row of destinations) {
    const location = await prisma.plantLocationNode.upsert({
      where: { plantCode_storageLocation: { plantCode: row.extPlant, storageLocation: row.extSloc } },
      update: { plantDescription: row.extPlantDesc || row.extPlant, storageDescription: row.extSlocDesc || row.extSloc },
      create: {
        plantCode: row.extPlant, storageLocation: row.extSloc,
        plantDescription: row.extPlantDesc || row.extPlant, storageDescription: row.extSlocDesc || row.extSloc,
      },
    });
    if (materialId) {
      await prisma.plantMaterialDestination.upsert({
        where: { materialId_locationId: { materialId, locationId: location.id } },
        update: {},
        create: { materialId, locationId: location.id },
      });
    }
  }

  const vehicleData = {
    internalNo: first.internalNo,
    externalNo: first.externalNo,
    materialNo: materialNo ?? "",
    materialId,
    plantCode: first.plantCode,
    plantDescription: first.plantDescription,
    storageLocation: first.storageLocation,
    storageDescription: first.storageDescription,
    vehicleGuid: first.vehicleGuid,
    moduleGuid: first.moduleGuid,
    modelCode: first.modelCode,
  };
  await prisma.plantVehicleCache.upsert({
    where: { chassisNo: first.chassisNo },
    update: vehicleData,
    create: { chassisNo: first.chassisNo, ...vehicleData },
  });
}

export type MaterialFetchResult = {
  materialNo: string;
  success: boolean;
  vehicleCount: number;
  destinationCount: number;
  error?: string;
};

/**
 * Admin-triggered, one material at a time: calls /plant filtered by Matnr (not previously used
 * anywhere in this app — only Vhvin filtering existed before), and upserts whatever it finds.
 * Used by the Master Data "Fetch by Material" tool (single entry or a pasted/uploaded list, one
 * call per material). Upsert-only, same safety rule as the chassis fallback — never deletes.
 */
export async function fetchAndCacheMaterial(materialNo: string): Promise<MaterialFetchResult> {
  const trimmed = materialNo.trim();
  if (!trimmed) return { materialNo, success: false, vehicleCount: 0, destinationCount: 0, error: "Empty material number." };

  let rawRows: PlantVehicleRow[];
  try {
    rawRows = await fetchPlantRowsByMaterial(trimmed);
  } catch (e) {
    return { materialNo: trimmed, success: false, vehicleCount: 0, destinationCount: 0, error: e instanceof Error ? e.message : String(e) };
  }

  if (rawRows.length === 0) {
    return { materialNo: trimmed, success: false, vehicleCount: 0, destinationCount: 0, error: "SAP returned no rows for this material." };
  }

  const vehicleByChassis = new Map<string, PlantVehicleRow>();
  const locationByKey = new Map<string, { plantCode: string; storageLocation: string; plantDescription: string; storageDescription: string }>();
  const destinationKeys = new Set<string>(); // `${plantCode}|${storageLocation}`

  for (const row of rawRows) {
    if (row.chassisNo && !vehicleByChassis.has(row.chassisNo)) vehicleByChassis.set(row.chassisNo, row);
    if (row.extPlant && row.extSloc) {
      const key = `${row.extPlant}|${row.extSloc}`;
      destinationKeys.add(key);
      if (!locationByKey.has(key)) {
        locationByKey.set(key, {
          plantCode: row.extPlant, storageLocation: row.extSloc,
          plantDescription: row.extPlantDesc || row.extPlant, storageDescription: row.extSlocDesc || row.extSloc,
        });
      }
    }
  }

  // Deliberately NOT wrapped in an interactive $transaction — a material's destination list can
  // be large (100+ rows for a single material was observed), and holding one interactive
  // transaction open across that many sequential statements was found to drop mid-way over the
  // app's connection-pooled DATABASE_URL (PgBouncer transaction mode). Plain sequential calls
  // avoid that; a partial write here just leaves the cache incomplete, not corrupted, same
  // best-effort philosophy already used for the one-by-one sync fallback.
  const material = await prisma.plantMaterial.upsert({
    where: { materialNo: trimmed },
    update: {},
    create: { materialNo: trimmed },
  });

  const locationIdByKey = new Map<string, string>();
  for (const loc of locationByKey.values()) {
    const location = await prisma.plantLocationNode.upsert({
      where: { plantCode_storageLocation: { plantCode: loc.plantCode, storageLocation: loc.storageLocation } },
      update: { plantDescription: loc.plantDescription, storageDescription: loc.storageDescription },
      create: loc,
    });
    locationIdByKey.set(`${loc.plantCode}|${loc.storageLocation}`, location.id);
  }

  for (const key of destinationKeys) {
    const locationId = locationIdByKey.get(key);
    if (!locationId) continue;
    await prisma.plantMaterialDestination.upsert({
      where: { materialId_locationId: { materialId: material.id, locationId } },
      update: {},
      create: { materialId: material.id, locationId },
    });
  }

  for (const v of vehicleByChassis.values()) {
    if (!v.chassisNo) continue;
    const vehicleData = {
      internalNo: v.internalNo, externalNo: v.externalNo, materialNo: trimmed, materialId: material.id,
      plantCode: v.plantCode, plantDescription: v.plantDescription,
      storageLocation: v.storageLocation, storageDescription: v.storageDescription,
      vehicleGuid: v.vehicleGuid, moduleGuid: v.moduleGuid, modelCode: v.modelCode,
    };
    await prisma.plantVehicleCache.upsert({
      where: { chassisNo: v.chassisNo },
      update: vehicleData,
      create: { chassisNo: v.chassisNo, ...vehicleData },
    });
  }

  return {
    materialNo: trimmed,
    success: true,
    vehicleCount: vehicleByChassis.size,
    destinationCount: locationByKey.size,
  };
}

/**
 * Fallback for when the single unfiltered /plant call can't complete (e.g. QA's known
 * timeout/instability under a large response). Prefers iterating known MATERIAL codes (far
 * fewer than vehicles — 11-50 vs. hundreds — and destinations are material-level anyway, same
 * insight behind fetchAndCacheMaterial), calling the same filtered /plant call the admin's
 * "Fetch by Material" tool uses. Falls back to iterating known chassis numbers only if no
 * materials are known yet at all (e.g. the very first-ever sync, before either a bulk sync or
 * an admin-seeded material list exists). Best-effort throughout: one failure never aborts
 * the rest.
 */
async function fetchPlantRowsOneByOne(): Promise<PlantVehicleRow[]> {
  const knownMaterials = await prisma.plantMaterial.findMany({ select: { materialNo: true } });

  if (knownMaterials.length > 0) {
    const rows: PlantVehicleRow[] = [];
    for (const { materialNo } of knownMaterials) {
      try {
        rows.push(...(await fetchPlantRowsByMaterial(materialNo)));
      } catch (e) {
        console.warn(`[PlantCache] one-by-one material fetch failed for ${materialNo}, skipping:`, e instanceof Error ? e.message : e);
      }
    }
    return rows;
  }

  // Bootstrap case: no materials known yet — fall back to chassis numbers already known from
  // the app's own data (same behavior as before material-based iteration existed).
  const [vehicleOptions, gatePasses] = await Promise.all([
    prisma.vehicleOption.findMany({ select: { chassisNo: true } }),
    prisma.gatePass.findMany({ where: { chassis: { not: null } }, select: { chassis: true }, distinct: ["chassis"] }),
  ]);

  const chassisNumbers = new Set<string>();
  for (const v of vehicleOptions) if (v.chassisNo) chassisNumbers.add(v.chassisNo.trim().toUpperCase());
  for (const g of gatePasses) if (g.chassis) chassisNumbers.add(g.chassis.trim().toUpperCase());

  const rows: PlantVehicleRow[] = [];
  for (const chassisNo of chassisNumbers) {
    try {
      rows.push(...(await fetchPlantVehicleRows(chassisNo)));
    } catch (e) {
      console.warn(`[PlantCache] one-by-one chassis fetch failed for ${chassisNo}, skipping:`, e instanceof Error ? e.message : e);
    }
  }
  return rows;
}

/**
 * Full resync: normally one live, unfiltered /plant fetch, normalized into the cache tables.
 * If that single large request fails (times out / errors — the exact "large data crashes"
 * problem this cache exists to work around), falls back to fetchPlantRowsOneByOne() so the
 * cache still fills up incrementally instead of staying empty. Called automatically once a
 * day (see lib/plantCacheScheduler.ts) and from the Admin "Sync Now" button
 * (app/api/admin/plant-cache/route.ts) — never from a normal page load or search.
 */
export async function syncPlantCacheFromSap(opts: {
  trigger: "AUTO" | "MANUAL";
  triggeredById?: string | null;
}): Promise<{ vehicleCount: number; locationCount: number; mode: "BULK" | "INCREMENTAL" }> {
  const log = await prisma.plantCacheSyncLog.create({
    data: { startedAt: new Date(), status: "RUNNING", trigger: opts.trigger, triggeredById: opts.triggeredById ?? null },
  });

  try {
    let mode: "BULK" | "INCREMENTAL" = "BULK";
    let rawRows: PlantVehicleRow[];
    try {
      rawRows = await fetchPlantVehicleRows();
    } catch (bulkError) {
      mode = "INCREMENTAL";
      console.warn("[PlantCache] bulk /plant fetch failed, falling back to one-by-one sync:", bulkError instanceof Error ? bulkError.message : bulkError);
      rawRows = await fetchPlantRowsOneByOne();
    }

    // Normalize the cross-joined raw response — dedupe vehicles, dedupe locations, dedupe
    // material->destination pairs. Never store the raw response 1:1 (a single chassis can
    // repeat 100+ times, once per destination option) — that would balloon storage and defeat
    // the point of caching it.
    const vehicleByChassis = new Map<string, PlantVehicleRow>();
    const locationByKey = new Map<string, { plantCode: string; storageLocation: string; plantDescription: string; storageDescription: string }>();
    const materialNos = new Set<string>();
    const materialDestPairs = new Set<string>(); // `${materialNo}|${plantCode}|${storageLocation}`

    for (const row of rawRows) {
      if (!row.chassisNo) continue;
      if (!vehicleByChassis.has(row.chassisNo)) vehicleByChassis.set(row.chassisNo, row);
      if (row.materialNo) materialNos.add(row.materialNo);

      if (row.extPlant && row.extSloc) {
        const locKey = `${row.extPlant}|${row.extSloc}`;
        if (!locationByKey.has(locKey)) {
          locationByKey.set(locKey, {
            plantCode: row.extPlant,
            storageLocation: row.extSloc,
            plantDescription: row.extPlantDesc || row.extPlant,
            storageDescription: row.extSlocDesc || row.extSloc,
          });
        }
        if (row.materialNo) materialDestPairs.add(`${row.materialNo}|${locKey}`);
      }
    }

    // Material/location creation and id lookup — plain sequential calls (idempotent, safe to
    // run outside a transaction either way).
    if (materialNos.size > 0) {
      await prisma.plantMaterial.createMany({
        data: [...materialNos].map((materialNo) => ({ materialNo })),
        skipDuplicates: true,
      });
    }
    if (locationByKey.size > 0) {
      await prisma.plantLocationNode.createMany({
        data: [...locationByKey.values()],
        skipDuplicates: true,
      });
    }

    const materials = materialNos.size > 0
      ? await prisma.plantMaterial.findMany({ where: { materialNo: { in: [...materialNos] } }, select: { id: true, materialNo: true } })
      : [];
    const materialIdByNo = new Map(materials.map((m) => [m.materialNo, m.id]));

    const locations = locationByKey.size > 0
      ? await prisma.plantLocationNode.findMany({
          where: { OR: [...locationByKey.values()].map((l) => ({ plantCode: l.plantCode, storageLocation: l.storageLocation })) },
          select: { id: true, plantCode: true, storageLocation: true },
        })
      : [];
    const locationIdByKey = new Map(locations.map((l) => [`${l.plantCode}|${l.storageLocation}`, l.id]));

    const destData = [...materialDestPairs]
      .map((key) => {
        const [materialNo, plantCode, storageLocation] = key.split("|");
        return { materialId: materialIdByNo.get(materialNo), locationId: locationIdByKey.get(`${plantCode}|${storageLocation}`) };
      })
      .filter((d): d is { materialId: string; locationId: string } => !!d.materialId && !!d.locationId);

    const vehicleData = [...vehicleByChassis.values()].map((v) => ({
      chassisNo: v.chassisNo,
      internalNo: v.internalNo,
      externalNo: v.externalNo,
      materialNo: v.materialNo,
      materialId: v.materialNo ? materialIdByNo.get(v.materialNo) ?? null : null,
      plantCode: v.plantCode,
      plantDescription: v.plantDescription,
      storageLocation: v.storageLocation,
      storageDescription: v.storageDescription,
      vehicleGuid: v.vehicleGuid,
      moduleGuid: v.moduleGuid,
      modelCode: v.modelCode,
    }));

    if (mode === "BULK") {
      // Bulk mode saw SAP's complete picture — safe to wipe and replace, so a vehicle/pairing
      // that genuinely no longer exists (e.g. SAP drops a vehicle from /plant once its
      // transfer is processed) doesn't linger as a stale cache row. Kept as a transaction —
      // only a handful of batch statements (not a per-row loop), so it doesn't hit the
      // pooled-connection issue that ruled out transactions for the per-row paths below.
      await prisma.$transaction(async (tx) => {
        await tx.plantMaterialDestination.deleteMany({});
        if (destData.length > 0) await tx.plantMaterialDestination.createMany({ data: destData, skipDuplicates: true });
        await tx.plantVehicleCache.deleteMany({});
        if (vehicleData.length > 0) await tx.plantVehicleCache.createMany({ data: vehicleData, skipDuplicates: true });
      }, { timeout: 120_000, maxWait: 15_000 });
    } else {
      // Incremental mode only ever covers a subset of known chassis numbers — wiping the
      // table first would delete everything NOT in this pass, losing data a previous
      // successful sync already had. Upsert only: add what's new, refresh what changed, leave
      // everything else untouched. Plain sequential calls, not one long transaction — this can
      // be a large per-row loop (many materials/vehicles), which was found to drop the
      // connection mid-way when held inside a single interactive transaction over the app's
      // pooled DATABASE_URL.
      for (const d of destData) {
        await prisma.plantMaterialDestination.upsert({
          where: { materialId_locationId: { materialId: d.materialId, locationId: d.locationId } },
          update: {},
          create: d,
        });
      }
      for (const v of vehicleData) {
        await prisma.plantVehicleCache.upsert({
          where: { chassisNo: v.chassisNo },
          update: v,
          create: v,
        });
      }
    }

    await prisma.plantCacheSyncLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        vehicleCount: vehicleByChassis.size,
        locationCount: locationByKey.size,
        mode,
      },
    });

    return { vehicleCount: vehicleByChassis.size, locationCount: locationByKey.size, mode };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.plantCacheSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 500) },
    }).catch(() => {});
    throw e;
  }
}
