import { prisma } from "@/lib/prisma";

export type MaintenanceStatus = { enabled: boolean; message: string | null };

const SINGLETON_ID = "singleton";

// Short in-memory cache — middleware checks this on every request, so we avoid a DB
// round-trip per request. Admin toggling on/off writes through and clears the cache
// immediately, so the change is never more than a few seconds delayed for anyone else.
const CACHE_TTL_MS = 3_000;
let cache: { status: MaintenanceStatus; fetchedAt: number } | null = null;

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.status;

  const row = await prisma.maintenanceMode.findUnique({ where: { id: SINGLETON_ID } }).catch(() => null);
  const status: MaintenanceStatus = { enabled: row?.enabled ?? false, message: row?.message ?? null };
  cache = { status, fetchedAt: now };
  return status;
}

export async function setMaintenanceStatus(params: { enabled: boolean; message: string | null; updatedById: string | null }): Promise<MaintenanceStatus> {
  const row = await prisma.maintenanceMode.upsert({
    where: { id: SINGLETON_ID },
    update: { enabled: params.enabled, message: params.message, updatedById: params.updatedById },
    create: { id: SINGLETON_ID, enabled: params.enabled, message: params.message, updatedById: params.updatedById },
  });
  cache = { status: { enabled: row.enabled, message: row.message }, fetchedAt: Date.now() };
  return { enabled: row.enabled, message: row.message };
}
