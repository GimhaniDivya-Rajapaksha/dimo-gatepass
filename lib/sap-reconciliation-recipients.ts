/**
 * Admin-managed recipient list for SAP Reconciliation emails (the "ready to write" digest sent
 * at 3 PM, and the "writing now" notice sent right before the scheduled auto-write) — see
 * lib/sapReconciliationScheduler.ts. Recipients are picked from Active Directory (via
 * /api/ad-users) and managed by Admin on the Master Data page — not hardcoded. Separate from
 * CdNotificationRecipient (lib/cd-notifications.ts); the two lists are independent. Defaults
 * are seeded once so notifications keep working immediately; Admin can add/remove afterward.
 *
 * Raw SQL throughout — same defensive convention used for other new tables (CdNotificationRecipient,
 * LtVehicleStatusOption, SapReconciliation) — never depends on the Prisma client having been
 * regenerated after the schema change.
 */

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const DEFAULT_RECIPIENTS = [
  { name: "Gimhani Rajapaksha", email: "gimhani.rajapaksha@dimolanka.com" },
  { name: "Tharindi Pathirana", email: "tharindi.pathirana@dimolanka.com" },
];

// Sentinel row marking "defaults have already been seeded once" — stored in the same table
// (never returned by getSapReconciliationRecipients, never shown/removable in the Admin UI) so
// that removing every real recipient down to zero does NOT look like "never seeded" and
// trigger the defaults to silently reappear. Seeding happens at most once, ever.
const SEED_MARKER_EMAIL = "__sap_recon_notify_seed_marker__";

export async function ensureSapReconciliationRecipientsSeeded(): Promise<void> {
  const markerRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "SapReconciliationRecipient" WHERE "email" = ${SEED_MARKER_EMAIL}
  `.catch(() => null);
  if (markerRows === null) return; // migration not applied yet — nothing to seed
  if (Number(markerRows[0]?.count ?? 0) > 0) return; // already seeded once, ever — never reseed

  await prisma.$executeRaw`
    INSERT INTO "SapReconciliationRecipient" ("id", "name", "email")
    VALUES (${randomUUID()}, 'Seed marker', ${SEED_MARKER_EMAIL})
    ON CONFLICT ("email") DO NOTHING
  `.catch(() => {});

  for (const r of DEFAULT_RECIPIENTS) {
    await prisma.$executeRaw`
      INSERT INTO "SapReconciliationRecipient" ("id", "name", "email")
      VALUES (${randomUUID()}, ${r.name}, ${r.email})
      ON CONFLICT ("email") DO NOTHING
    `.catch(() => {});
  }
}

export async function getSapReconciliationRecipients(): Promise<{ id: string; name: string; email: string; createdAt: Date }[]> {
  await ensureSapReconciliationRecipientsSeeded();
  return prisma.$queryRaw<{ id: string; name: string; email: string; createdAt: Date }[]>`
    SELECT "id", "name", "email", "createdAt" FROM "SapReconciliationRecipient"
    WHERE "email" != ${SEED_MARKER_EMAIL}
    ORDER BY "name" ASC
  `.catch(() => []);
}

/** Convenience helper for callers (the scheduler) that only need the plain email list. */
export async function getSapReconciliationRecipientEmails(): Promise<string[]> {
  const rows = await getSapReconciliationRecipients();
  return rows.map((r) => r.email);
}
