/**
 * Admin SAP Reconciliation — tracks Location Transfer gate passes that completed without an
 * SAP write (vehicle wasn't eligible per MMSTA=QP60 / SDSTA blank-or-QS20 at the time) so an
 * Admin can later re-check SAP and manually write the vehicle once it becomes eligible.
 *
 * Does not change the existing Location Transfer flow, Customer Delivery flow, or SAP-write
 * eligibility rule — `recordSkippedSapWrite` is called as a pure side-effect from the same
 * "SAP write skipped" branches that already exist in status/route.ts, and writes reuse
 * `updateVehiclePlantLocation` (lib/location-api.ts) exactly as the normal flow does.
 *
 * If the same vehicle has multiple outstanding (un-written) Location Transfers — e.g. it
 * moved A→B, then B→C, both while ineligible — writes are never issued independently per
 * record. `writeVehicleChain` always resolves and writes ALL outstanding hops for that
 * vehicle together, oldest first, stopping immediately if any hop isn't eligible or fails,
 * so SAP is never written out of chronological order.
 *
 * New tables (SapReconciliation, SapReconciliationAuditLog) are accessed via raw SQL — same
 * defensive convention used for UserPlantMapping / LtVehicleStatusOption — so this never
 * depends on the Prisma client having been regenerated after the schema change.
 */

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { fetchVehicleSapStatus, isSapWriteEligible } from "@/lib/sap";
import { fetchPlantLocationOptions, findPlantLocationOption, updateVehiclePlantLocation, type PlantLocationTarget } from "@/lib/location-api";
import { sendSapReconciliationReadyEmail, sendSapReadyDigestEmail, sendSapAutoWriteDigestEmail, sendSapPendingWriteTonightEmail } from "@/lib/email";

export type SapEligibility = "PENDING" | "READY" | "WRITTEN" | "FAILED";

export const ELIGIBILITY_LABEL: Record<SapEligibility, string> = {
  PENDING: "Not Yet Eligible",
  READY:   "Ready for SAP Write",
  WRITTEN: "Already Written",
  FAILED:  "Write Failed",
};

export async function recordSkippedSapWrite(params: {
  gatePassId: string;
  mmsta: string;
  sdsta: string;
  ltCompletedAt: Date;
}): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "SapReconciliation"
        ("id", "gatePassId", "ltCompletedAt", "mmstaAtCompletion", "sdstaAtCompletion", "eligibility")
      VALUES (${randomUUID()}, ${params.gatePassId}, ${params.ltCompletedAt}, ${params.mmsta}, ${params.sdsta}, 'PENDING')
      ON CONFLICT ("gatePassId") DO NOTHING
    `;
  } catch (e) {
    console.error("[sap-reconciliation] recordSkippedSapWrite failed:", e);
  }
}

async function insertAuditLog(entry: {
  reconciliationId: string;
  gatePassId: string;
  action: "CHECK" | "WRITE_ATTEMPT";
  mode: string;
  triggeredById: string | null;
  triggeredByName: string;
  mmsta?: string | null;
  sdsta?: string | null;
  success?: boolean | null;
  responseMessage?: string | null;
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "SapReconciliationAuditLog"
      ("id", "reconciliationId", "gatePassId", "action", "mode", "triggeredById", "triggeredByName", "mmstaAtCheck", "sdstaAtCheck", "success", "responseMessage")
    VALUES (${randomUUID()}, ${entry.reconciliationId}, ${entry.gatePassId}, ${entry.action}, ${entry.mode}, ${entry.triggeredById}, ${entry.triggeredByName}, ${entry.mmsta ?? null}, ${entry.sdsta ?? null}, ${entry.success ?? null}, ${entry.responseMessage ?? null})
  `.catch((e) => console.error("[sap-reconciliation] audit log insert failed:", e));
}

async function notifyInitiatorNewlyReady(
  reconciliationId: string,
  gatePass: { id: string; gatePassNumber: string; vehicle: string; createdById: string; createdBy: { name: string; email: string } }
): Promise<void> {
  const message = `Vehicle ${gatePass.vehicle} from Gate Pass ${gatePass.gatePassNumber} has now reached an SAP-write eligible status. SAP write is pending Admin action.`;

  try {
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "SAP_RECONCILIATION_READY",
        title: "Vehicle Ready for SAP Write",
        message,
        gatePassId: gatePass.id,
      },
    });
  } catch (e) {
    console.error("[sap-reconciliation] notification create failed:", e);
  }

  try {
    if (gatePass.createdBy.email) {
      await sendSapReconciliationReadyEmail(gatePass.createdBy.email, gatePass.createdBy.name, {
        gatePassNumber: gatePass.gatePassNumber,
        vehicle: gatePass.vehicle,
        passId: gatePass.id,
      });
    }
  } catch (e) {
    console.error("[sap-reconciliation] email failed:", e);
  }

  await prisma.$executeRaw`
    UPDATE "SapReconciliation" SET "notifiedAt" = ${new Date()} WHERE "id" = ${reconciliationId}
  `.catch((e) => console.error("[sap-reconciliation] notifiedAt update failed:", e));
}

/**
 * Check-only pass over every non-WRITTEN pending row: re-fetches each vehicle's latest SAP
 * status, updates eligibility, and notifies the Initiator (once) on a PENDING/FAILED → READY
 * transition. Never writes to SAP itself — used by both the automatic hourly job and the
 * Admin "Check Now" button (mode distinguishes them in the audit trail). The Gimhani/
 * Tharindhi "pending write tonight" list is a separate, fixed-time daily send — see
 * sendPendingWriteTonightDigest — not tied to this check's own cadence.
 */
export async function runReconciliationCheck(params: {
  triggeredById: string | null;
  triggeredByName: string;
  mode: "AUTO" | "MANUAL";
}): Promise<{ checked: number; newlyReady: number }> {
  const pending = await prisma.$queryRaw<{ id: string; gatePassId: string; notifiedAt: Date | null }[]>`
    SELECT "id", "gatePassId", "notifiedAt" FROM "SapReconciliation" WHERE "eligibility" != 'WRITTEN'
  `.catch(() => []);

  let newlyReady = 0;

  for (const row of pending) {
    const gatePass = await prisma.gatePass.findUnique({
      where: { id: row.gatePassId },
      select: {
        id: true, gatePassNumber: true, vehicle: true, chassis: true, createdById: true,
        fromLocation: true, toLocation: true,
        createdBy: { select: { name: true, email: true } },
      },
    });
    if (!gatePass) continue;

    const sapStatus = await fetchVehicleSapStatus(gatePass.chassis ?? "").catch(() => null);
    const eligible = isSapWriteEligible(sapStatus);
    const nextEligibility: SapEligibility = eligible ? "READY" : "PENDING";
    const now = new Date();

    await prisma.$executeRaw`
      UPDATE "SapReconciliation"
      SET "latestMmsta" = ${sapStatus?.mmsta ?? null}, "latestSdsta" = ${sapStatus?.sdsta ?? null},
          "eligibility" = ${nextEligibility}, "lastCheckedAt" = ${now}
      WHERE "id" = ${row.id}
    `;

    await insertAuditLog({
      reconciliationId: row.id, gatePassId: row.gatePassId, action: "CHECK", mode: params.mode,
      triggeredById: params.triggeredById, triggeredByName: params.triggeredByName,
      mmsta: sapStatus?.mmsta ?? null, sdsta: sapStatus?.sdsta ?? null,
    });

    if (eligible && !row.notifiedAt) {
      newlyReady++;
      await notifyInitiatorNewlyReady(row.id, gatePass);
    }
  }

  return { checked: pending.length, newlyReady };
}

/**
 * Fixed-time daily send (see lib/sapReconciliationScheduler.ts, ~3 PM) to the Gimhani/
 * Tharindhi recipient list — lists every vehicle currently "Ready for SAP Write" at send
 * time, regardless of which hourly check found it. Skips sending if nothing is ready.
 */
export async function sendPendingWriteTonightDigest(recipients: string[]): Promise<boolean> {
  const vehicles = await getReadyVehiclesForDigest();
  if (vehicles.length === 0) return false;

  for (const email of recipients) {
    await sendSapPendingWriteTonightEmail(email, vehicles).catch((e) =>
      console.error(`[sap-reconciliation] pending-write-tonight email to ${email} failed:`, e)
    );
  }
  return true;
}

type WriteResult = { success: boolean; alreadyWritten?: boolean; notEligible?: boolean; message: string };

/**
 * Writes exactly one hop (one reconciliation row). Always revalidates current SAP status
 * before writing — never trusts a previous check. Called only from writeVehicleChain, which
 * enforces that hops for the same vehicle are written in chronological order.
 */
async function writeOneHop(
  row: { id: string; gatePassId: string },
  params: { adminId: string | null; adminName: string; mode: "INDIVIDUAL" | "BULK" | "AUTO" }
): Promise<WriteResult> {
  const gatePass = await prisma.gatePass.findUnique({
    where: { id: row.gatePassId },
    select: {
      id: true, gatePassNumber: true, vehicle: true, chassis: true,
      toLocation: true, toPlantCode: true, toStorageLocation: true, sapVehicleId: true,
    },
  });
  if (!gatePass) return { success: false, message: "Gate pass not found." };

  const sapStatus = await fetchVehicleSapStatus(gatePass.chassis ?? "").catch(() => null);
  const now = new Date();

  if (!isSapWriteEligible(sapStatus)) {
    await prisma.$executeRaw`
      UPDATE "SapReconciliation"
      SET "latestMmsta" = ${sapStatus?.mmsta ?? null}, "latestSdsta" = ${sapStatus?.sdsta ?? null},
          "eligibility" = 'PENDING', "lastCheckedAt" = ${now}
      WHERE "id" = ${row.id}
    `;
    await insertAuditLog({
      reconciliationId: row.id, gatePassId: row.gatePassId, action: "WRITE_ATTEMPT", mode: params.mode,
      triggeredById: params.adminId, triggeredByName: params.adminName,
      mmsta: sapStatus?.mmsta ?? null, sdsta: sapStatus?.sdsta ?? null,
      success: false, responseMessage: "Vehicle is no longer eligible for SAP write.",
    });
    return { success: false, notEligible: true, message: "Vehicle is no longer eligible for SAP write (status changed since last check)." };
  }

  // Same 3-step target-location resolution as the normal LT SAP-write call sites.
  let targetLocation: PlantLocationTarget | null = null;
  if (gatePass.toPlantCode && gatePass.toStorageLocation) {
    targetLocation = {
      plantCode: gatePass.toPlantCode,
      plantDescription: gatePass.toLocation ?? "",
      storageLocation: gatePass.toStorageLocation,
      storageDescription: "",
    };
  } else {
    const plantOptions = await fetchPlantLocationOptions().catch(() => []);
    targetLocation = findPlantLocationOption(plantOptions, gatePass.toLocation);
    if (!targetLocation) {
      const dbLocations = await prisma.locationOption.findMany({ orderBy: { plantCode: "asc" } });
      targetLocation = findPlantLocationOption(
        dbLocations.map((l) => ({
          plantCode: l.plantCode,
          plantDescription: l.plantDescription,
          storageLocation: l.storageLocation,
          storageDescription: l.storageDescription,
        })),
        gatePass.toLocation
      );
    }
  }

  if (!targetLocation) {
    await insertAuditLog({
      reconciliationId: row.id, gatePassId: row.gatePassId, action: "WRITE_ATTEMPT", mode: params.mode,
      triggeredById: params.adminId, triggeredByName: params.adminName,
      mmsta: sapStatus?.mmsta ?? null, sdsta: sapStatus?.sdsta ?? null,
      success: false, responseMessage: "SAP location not resolved for destination.",
    });
    return { success: false, message: `SAP location not resolved for "${gatePass.toLocation ?? ""}".` };
  }

  try {
    const result = await updateVehiclePlantLocation({
      identifiers: [gatePass.vehicle, gatePass.chassis],
      destination: targetLocation,
      sapFallback: { internalNo: gatePass.sapVehicleId, externalNo: gatePass.vehicle, chassisNo: gatePass.chassis },
    });

    await prisma.$executeRaw`
      UPDATE "SapReconciliation"
      SET "latestMmsta" = ${sapStatus?.mmsta ?? null}, "latestSdsta" = ${sapStatus?.sdsta ?? null},
          "eligibility" = 'WRITTEN', "writtenAt" = ${now}, "writtenById" = ${params.adminId}, "lastCheckedAt" = ${now}
      WHERE "id" = ${row.id}
    `;
    await insertAuditLog({
      reconciliationId: row.id, gatePassId: row.gatePassId, action: "WRITE_ATTEMPT", mode: params.mode,
      triggeredById: params.adminId, triggeredByName: params.adminName,
      mmsta: sapStatus?.mmsta ?? null, sdsta: sapStatus?.sdsta ?? null,
      success: true, responseMessage: result.message,
    });
    return { success: true, message: result.message };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "SAP write failed.";
    await prisma.$executeRaw`
      UPDATE "SapReconciliation"
      SET "latestMmsta" = ${sapStatus?.mmsta ?? null}, "latestSdsta" = ${sapStatus?.sdsta ?? null},
          "eligibility" = 'FAILED', "lastCheckedAt" = ${now}
      WHERE "id" = ${row.id}
    `;
    await insertAuditLog({
      reconciliationId: row.id, gatePassId: row.gatePassId, action: "WRITE_ATTEMPT", mode: params.mode,
      triggeredById: params.adminId, triggeredByName: params.adminName,
      mmsta: sapStatus?.mmsta ?? null, sdsta: sapStatus?.sdsta ?? null,
      success: false, responseMessage: msg,
    });
    return { success: false, message: msg };
  }
}

/**
 * Writes every not-yet-WRITTEN reconciliation record for one vehicle (chassis), in strict
 * chronological order (oldest ltCompletedAt first) — so SAP reflects the vehicle's full
 * movement history (e.g. A→B→C), never just its latest destination. Stops the chain the
 * moment a hop is not eligible or fails to write, so a later hop is never written while an
 * earlier one for the same vehicle is still outstanding.
 */
async function writeVehicleChain(params: {
  chassis: string;
  adminId: string | null;
  adminName: string;
  mode: "INDIVIDUAL" | "BULK" | "AUTO";
}): Promise<(WriteResult & { reconciliationId: string })[]> {
  const rows = await prisma.$queryRaw<{ id: string; gatePassId: string }[]>`
    SELECT sr."id", sr."gatePassId"
    FROM "SapReconciliation" sr
    JOIN "GatePass" gp ON gp."id" = sr."gatePassId"
    WHERE gp."chassis" = ${params.chassis} AND sr."eligibility" != 'WRITTEN'
    ORDER BY sr."ltCompletedAt" ASC
  `.catch(() => []);

  const results: (WriteResult & { reconciliationId: string })[] = [];
  for (const row of rows) {
    const result = await writeOneHop(row, params);
    results.push({ reconciliationId: row.id, ...result });
    if (!result.success) break; // never write a later hop while an earlier one is outstanding
  }
  return results;
}

/**
 * Individual/bulk/auto "Write to SAP" entry point for one reconciliation record. Resolves
 * the record's vehicle and writes that vehicle's FULL chronological chain of outstanding
 * hops (not just this one record) — see writeVehicleChain. Refuses if this specific row is
 * already WRITTEN (duplicate-write guard); returns this row's own result from the chain.
 */
export async function writeSingleReconciliation(params: {
  reconciliationId: string;
  adminId: string | null; // null when triggered by the daily auto-write job (mode "AUTO")
  adminName: string;
  mode: "INDIVIDUAL" | "BULK" | "AUTO";
}): Promise<WriteResult> {
  const row = await prisma.$queryRaw<{ id: string; gatePassId: string; eligibility: SapEligibility }[]>`
    SELECT "id", "gatePassId", "eligibility" FROM "SapReconciliation" WHERE "id" = ${params.reconciliationId}
  `.then((r) => r[0] ?? null).catch(() => null);

  if (!row) return { success: false, message: "Reconciliation record not found." };
  if (row.eligibility === "WRITTEN") return { success: false, alreadyWritten: true, message: "Already written." };

  const gatePass = await prisma.gatePass.findUnique({ where: { id: row.gatePassId }, select: { chassis: true } });
  if (!gatePass?.chassis) return { success: false, message: "Vehicle chassis not found for this gate pass." };

  const chainResults = await writeVehicleChain({
    chassis: gatePass.chassis,
    adminId: params.adminId,
    adminName: params.adminName,
    mode: params.mode,
  });

  const mine = chainResults.find((r) => r.reconciliationId === params.reconciliationId);
  if (mine) return mine;

  return {
    success: false,
    message: "An earlier movement for this vehicle must be written first (it was not yet eligible or failed) — this record was not attempted.",
  };
}

/**
 * Automatic SAP write pass — for every distinct vehicle with at least one "Ready for SAP
 * Write" record, writes that vehicle's full chronological chain of outstanding hops (see
 * writeVehicleChain), revalidating each hop fresh immediately before writing. Intended to
 * run automatically on a schedule (see lib/sapReconciliationScheduler.ts), right after a
 * check has run. Manual "Write to SAP" / "Write Selected to SAP" still work independently.
 */
export async function runAutoWriteReadyVehicles(): Promise<{ attempted: number; written: number; failed: number; noLongerEligible: number }> {
  const readyChassis = await prisma.$queryRaw<{ chassis: string }[]>`
    SELECT DISTINCT gp."chassis" as chassis
    FROM "SapReconciliation" sr
    JOIN "GatePass" gp ON gp."id" = sr."gatePassId"
    WHERE sr."eligibility" = 'READY' AND gp."chassis" IS NOT NULL
  `.catch(() => []);

  let attempted = 0, written = 0, failed = 0, noLongerEligible = 0;
  for (const { chassis } of readyChassis) {
    const results = await writeVehicleChain({ chassis, adminId: null, adminName: "System (Automatic Reconciliation)", mode: "AUTO" });
    for (const r of results) {
      attempted++;
      if (r.success) written++;
      else if (r.notEligible) noLongerEligible++;
      else failed++;
    }
  }
  return { attempted, written, failed, noLongerEligible };
}

/**
 * For vehicles with an outstanding (un-written) SAP Reconciliation record, SAP's own
 * "current location" data is stale — our own database knows the vehicle actually moved
 * (the last completed-but-unwritten Location Transfer's destination) even though SAP
 * hasn't been updated to reflect it yet. Returns the DB-known location per chassis, for
 * every chassis in the input list that currently has a pending/unwritten record — used to
 * override "current location" displays for just those vehicles; every other vehicle is
 * completely unaffected and keeps showing live SAP data as before.
 */
export async function getPendingDbLocationsByChassis(chassisList: string[]): Promise<Map<string, string>> {
  const wanted = new Set(chassisList.map((c) => c.trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return new Map();

  const pending = await prisma.$queryRaw<{ gatePassId: string; ltCompletedAt: Date }[]>`
    SELECT "gatePassId", "ltCompletedAt" FROM "SapReconciliation" WHERE "eligibility" != 'WRITTEN'
  `.catch(() => []);
  if (pending.length === 0) return new Map();

  const gatePasses = await prisma.gatePass.findMany({
    where: { id: { in: pending.map((p) => p.gatePassId) } },
    select: { id: true, chassis: true, toLocation: true },
  });
  const gpMap = new Map(gatePasses.map((g) => [g.id, g]));

  // Latest per chassis, in case a vehicle has multiple outstanding hops (e.g. A→B→C).
  const latestByChassis = new Map<string, { toLocation: string; ltCompletedAt: Date }>();
  for (const row of pending) {
    const gp = gpMap.get(row.gatePassId);
    if (!gp?.chassis || !gp.toLocation) continue;
    const key = gp.chassis.trim().toUpperCase();
    if (!wanted.has(key)) continue;
    const existing = latestByChassis.get(key);
    if (!existing || row.ltCompletedAt > existing.ltCompletedAt) {
      latestByChassis.set(key, { toLocation: gp.toLocation, ltCompletedAt: row.ltCompletedAt });
    }
  }

  const result = new Map<string, string>();
  for (const [chassis, v] of latestByChassis) result.set(chassis, v.toLocation);
  return result;
}

/**
 * DB-first current-location source for non-QP60 vehicles (Location Transfer / Test Drive /
 * Vehicle Report — never Customer Delivery, see call sites): the destination of the vehicle's
 * most recently COMPLETED gate pass, for every chassis in the input list. Unlike
 * getPendingDbLocationsByChassis (which only covers vehicles with an outstanding un-written
 * SAP reconciliation record), this covers ANY vehicle with completed gate pass history,
 * regardless of reconciliation status. Callers fall back to SAP when a chassis has no entry
 * in the returned map (no completed history at all).
 */
export async function getLastCompletedToLocationByChassis(chassisList: string[]): Promise<Map<string, string>> {
  const wanted = new Set(chassisList.map((c) => c.trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return new Map();

  const passes = await prisma.gatePass.findMany({
    where: { status: "COMPLETED", chassis: { not: null }, toLocation: { not: null } },
    select: { chassis: true, toLocation: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const result = new Map<string, string>();
  for (const p of passes) {
    if (!p.chassis || !p.toLocation) continue;
    const key = p.chassis.trim().toUpperCase();
    if (!wanted.has(key) || result.has(key)) continue; // first hit per chassis = most recent (already sorted desc)
    result.set(key, p.toLocation);
  }
  return result;
}

type DigestVehicle = { gatePassNumber: string; vehicle: string; fromLocation: string; toLocation: string; mmsta: string; sdsta: string };

async function getReadyVehiclesForDigest(): Promise<DigestVehicle[]> {
  const rows = await prisma.$queryRaw<{ gatePassId: string; latestMmsta: string | null; latestSdsta: string | null }[]>`
    SELECT "gatePassId", "latestMmsta", "latestSdsta" FROM "SapReconciliation" WHERE "eligibility" = 'READY'
  `.catch(() => []);
  if (rows.length === 0) return [];

  const gatePasses = await prisma.gatePass.findMany({
    where: { id: { in: rows.map((r) => r.gatePassId) } },
    select: { id: true, gatePassNumber: true, vehicle: true, fromLocation: true, toLocation: true },
  });
  const gpMap = new Map(gatePasses.map((g) => [g.id, g]));

  return rows
    .map((r) => {
      const gp = gpMap.get(r.gatePassId);
      if (!gp) return null;
      return {
        gatePassNumber: gp.gatePassNumber,
        vehicle: gp.vehicle,
        fromLocation: gp.fromLocation ?? "",
        toLocation: gp.toLocation ?? "",
        mmsta: r.latestMmsta ?? "",
        sdsta: r.latestSdsta ?? "",
      };
    })
    .filter((v): v is DigestVehicle => v !== null);
}

/**
 * Sends the "Ready for SAP Write" digest to a fixed list of recipients. Skips sending
 * entirely when nothing is currently ready, to avoid a daily empty-list email. Returns
 * whether an email was actually sent.
 */
export async function sendDailyReadyDigest(recipients: string[]): Promise<boolean> {
  const vehicles = await getReadyVehiclesForDigest();
  if (vehicles.length === 0) return false;

  for (const email of recipients) {
    await sendSapReadyDigestEmail(email, vehicles).catch((e) =>
      console.error(`[sap-reconciliation] digest email to ${email} failed:`, e)
    );
  }
  return true;
}

async function getRecentlyWrittenVehiclesForDigest(since: Date): Promise<DigestVehicle[]> {
  const rows = await prisma.$queryRaw<{ gatePassId: string; latestMmsta: string | null; latestSdsta: string | null }[]>`
    SELECT "gatePassId", "latestMmsta", "latestSdsta" FROM "SapReconciliation"
    WHERE "eligibility" = 'WRITTEN' AND "writtenAt" >= ${since}
  `.catch(() => []);
  if (rows.length === 0) return [];

  const gatePasses = await prisma.gatePass.findMany({
    where: { id: { in: rows.map((r) => r.gatePassId) } },
    select: { id: true, gatePassNumber: true, vehicle: true, fromLocation: true, toLocation: true },
  });
  const gpMap = new Map(gatePasses.map((g) => [g.id, g]));

  return rows
    .map((r) => {
      const gp = gpMap.get(r.gatePassId);
      if (!gp) return null;
      return {
        gatePassNumber: gp.gatePassNumber,
        vehicle: gp.vehicle,
        fromLocation: gp.fromLocation ?? "",
        toLocation: gp.toLocation ?? "",
        mmsta: r.latestMmsta ?? "",
        sdsta: r.latestSdsta ?? "",
      };
    })
    .filter((v): v is DigestVehicle => v !== null);
}

/**
 * Sends the "just auto-written to SAP" notification to a fixed list of recipients, for
 * vehicles written since the given cutoff (the start of the current automatic cycle). Skips
 * sending entirely when nothing was written this cycle. Returns whether an email was sent.
 */
export async function sendAutoWriteResultDigest(recipients: string[], since: Date): Promise<boolean> {
  const vehicles = await getRecentlyWrittenVehiclesForDigest(since);
  if (vehicles.length === 0) return false;

  for (const email of recipients) {
    await sendSapAutoWriteDigestEmail(email, vehicles).catch((e) =>
      console.error(`[sap-reconciliation] auto-write digest email to ${email} failed:`, e)
    );
  }
  return true;
}
