/**
 * Admin-configurable vehicle status allowlist for the Location Transfer vehicle dropdown.
 *
 * Every code below is an individually toggleable admin option, persisted in
 * `LtVehicleStatusOption` (survives logout/deploy/restart). "QV*" / "VMM*" / "VMS*" are
 * catch-all entries meaning "any other status starting with that prefix that isn't one of
 * the specific codes already listed below it" — not literal SAP status values.
 *
 * This list fully replaces the earlier hardcoded LT allowlist. It intentionally has no
 * catch-all for QE/QP/QR/QS/QT — those families only match the specific codes listed here,
 * which is also why Customer Delivery's own statuses (QS40/QS4X/QS50/QS5X/QS60) are simply
 * absent and can never appear, with no separate exclusion list needed.
 */

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const LT_CATCH_ALL_PREFIXES: Record<string, string> = {
  "QV*":  "QV",
  "VMM*": "VMM",
  "VMS*": "VMS",
};

export const LT_STATUS_CODES: string[] = [
  "QE62", "QE64", "QE66", "QE68",
  "QP03", "QP05", "QP25", "QP26", "QP30", "QP40", "QP60", "QP80", "QP90", "QP95", "QP98", "QP99",
  "QR10", "QR15", "QR20",
  "QS05", "QS10", "QS20", "QS25", "QS30", "QS98", "QS99",
  "QT05", "QT10", "QT20", "QT30", "QT40",
  "QV*", "QV05", "QV10", "QV20", "QV25", "QV30", "QV40", "QV45", "QV50",
  "VMM*", "VMM1", "VMM2", "VMM3", "VMM4", "VMM5", "VMM6", "VMM7", "VMM8",
  "VMS*", "VMS1", "VMS2", "VMS3", "VMS4", "VMS5", "VMS6",
];

const LT_LITERAL_CODES = new Set(LT_STATUS_CODES.filter((c) => !(c in LT_CATCH_ALL_PREFIXES)));

/** Seeds every known code as enabled, once — a no-op once rows already exist. */
export async function ensureSeeded(): Promise<void> {
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "LtVehicleStatusOption"
  `.catch(() => null);
  if (countRows === null) return; // migration not applied yet — nothing to seed
  if (Number(countRows[0]?.count ?? 0) > 0) return;

  for (const code of LT_STATUS_CODES) {
    await prisma.$executeRaw`
      INSERT INTO "LtVehicleStatusOption" ("id", "code", "enabled")
      VALUES (${randomUUID()}, ${code}, true)
      ON CONFLICT ("code") DO NOTHING
    `.catch(() => {});
  }
}

export type LtStatusSets = { exact: Set<string>; catchAllPrefixes: Set<string> };

export async function getEnabledLtStatusSets(): Promise<LtStatusSets> {
  await ensureSeeded();
  const rows = await prisma.$queryRaw<{ code: string }[]>`
    SELECT "code" FROM "LtVehicleStatusOption" WHERE "enabled" = true
  `.catch(() => null);

  // Table not migrated yet — fail open to "every known status allowed" so the Location
  // Transfer vehicle search never silently breaks before this migration has run.
  if (rows === null) {
    return {
      exact: new Set(LT_LITERAL_CODES),
      catchAllPrefixes: new Set(Object.values(LT_CATCH_ALL_PREFIXES)),
    };
  }

  const exact = new Set<string>();
  const catchAllPrefixes = new Set<string>();
  for (const row of rows) {
    const prefix = LT_CATCH_ALL_PREFIXES[row.code];
    if (prefix) catchAllPrefixes.add(prefix);
    else exact.add(row.code);
  }
  return { exact, catchAllPrefixes };
}

/** Sync matcher against a pre-fetched set — call getEnabledLtStatusSets() once per batch. */
export function isLtStatusEligible(mmsta: string, sets: LtStatusSets): boolean {
  const code = mmsta.trim().toUpperCase();
  if (!code) return false;
  if (sets.exact.has(code)) return true;
  // A specifically-listed code that's been individually disabled must never be rescued
  // by a same-prefix catch-all toggle.
  if (LT_LITERAL_CODES.has(code)) return false;
  for (const prefix of sets.catchAllPrefixes) {
    if (code.startsWith(prefix)) return true;
  }
  return false;
}
