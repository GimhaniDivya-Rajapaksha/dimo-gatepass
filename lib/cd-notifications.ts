/**
 * Admin-managed recipient list for the "Customer Delivery Completed" email — sent after
 * Initiator Print or Security Gate Out completes a Customer Delivery pass (see status/route.ts).
 * Recipients are picked from Active Directory (via /api/ad-users) and managed by Admin on
 * the Master Data page — not hardcoded. Defaults are seeded once so notifications keep
 * working immediately; Admin can add/remove from there afterward.
 *
 * Raw SQL throughout — same defensive convention used for other new tables (UserPlantMapping,
 * LtVehicleStatusOption, SapReconciliation) — never depends on the Prisma client having been
 * regenerated after the schema change.
 */

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const DEFAULT_RECIPIENTS = [
  { name: "Gimhani Rajapaksha", email: "gimhani.rajapaksha@dimolanka.com" },
  { name: "Tharindhi Pathirana", email: "tharindi.pathirana@dimolanka.com" },
];

// Sentinel row marking "defaults have already been seeded once" — stored in the same table
// (never returned by getCdNotificationRecipients, never shown/removable in the Admin UI) so
// that removing every real recipient down to zero does NOT look like "never seeded" and
// trigger the defaults to silently reappear. Seeding now happens at most once, ever.
const SEED_MARKER_EMAIL = "__cd_notify_seed_marker__";

export async function ensureCdNotificationSeeded(): Promise<void> {
  const markerRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "CdNotificationRecipient" WHERE "email" = ${SEED_MARKER_EMAIL}
  `.catch(() => null);
  if (markerRows === null) return; // migration not applied yet — nothing to seed
  if (Number(markerRows[0]?.count ?? 0) > 0) return; // already seeded once, ever — never reseed

  await prisma.$executeRaw`
    INSERT INTO "CdNotificationRecipient" ("id", "name", "email")
    VALUES (${randomUUID()}, 'Seed marker', ${SEED_MARKER_EMAIL})
    ON CONFLICT ("email") DO NOTHING
  `.catch(() => {});

  for (const r of DEFAULT_RECIPIENTS) {
    await prisma.$executeRaw`
      INSERT INTO "CdNotificationRecipient" ("id", "name", "email")
      VALUES (${randomUUID()}, ${r.name}, ${r.email})
      ON CONFLICT ("email") DO NOTHING
    `.catch(() => {});
  }
}

export async function getCdNotificationRecipients(): Promise<{ id: string; name: string; email: string; createdAt: Date }[]> {
  await ensureCdNotificationSeeded();
  return prisma.$queryRaw<{ id: string; name: string; email: string; createdAt: Date }[]>`
    SELECT "id", "name", "email", "createdAt" FROM "CdNotificationRecipient"
    WHERE "email" != ${SEED_MARKER_EMAIL}
    ORDER BY "name" ASC
  `.catch(() => []);
}
