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
  { name: "Tharindhi Pathirana", email: "tharindhi.pathirana@dimolanka.com" },
];

export async function ensureCdNotificationSeeded(): Promise<void> {
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "CdNotificationRecipient"
  `.catch(() => null);
  if (countRows === null) return; // migration not applied yet — nothing to seed
  if (Number(countRows[0]?.count ?? 0) > 0) return;

  for (const r of DEFAULT_RECIPIENTS) {
    await prisma.$executeRaw`
      INSERT INTO "CdNotificationRecipient" ("id", "name", "email")
      VALUES (${randomUUID()}, ${r.name}, ${r.email})
      ON CONFLICT ("email") DO NOTHING
    `.catch(() => {});
  }
}

export async function getCdNotificationRecipients(): Promise<{ id: string; name: string; email: string }[]> {
  await ensureCdNotificationSeeded();
  return prisma.$queryRaw<{ id: string; name: string; email: string }[]>`
    SELECT "id", "name", "email" FROM "CdNotificationRecipient" ORDER BY "name" ASC
  `.catch(() => []);
}
