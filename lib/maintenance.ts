import { prisma } from "@/lib/prisma";

export type MaintenanceStatus = {
  enabled: boolean;
  message: string | null;
  startAt: string | null; // ISO string — serializable straight to JSON / client props
  endAt: string | null;
};

const SINGLETON_ID = "singleton";

// Short in-memory cache — every page checks this on every load (server-side, in the layout)
// and the client overlay polls it periodically, so we avoid a DB round-trip on every one of
// those. Admin toggling/extending writes through and clears the cache immediately.
const CACHE_TTL_MS = 3_000;
let cache: { status: MaintenanceStatus; fetchedAt: number } | null = null;

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.status;

  const row = await prisma.maintenanceMode.findUnique({ where: { id: SINGLETON_ID } }).catch(() => null);
  const status: MaintenanceStatus = {
    enabled: row?.enabled ?? false,
    message: row?.message ?? null,
    startAt: row?.startAt ? row.startAt.toISOString() : null,
    endAt: row?.endAt ? row.endAt.toISOString() : null,
  };
  cache = { status, fetchedAt: now };
  return status;
}

export async function setMaintenanceStatus(params: {
  enabled: boolean;
  message: string | null;
  startAt: Date | null;
  endAt: Date | null;
  updatedById: string | null;
}): Promise<MaintenanceStatus> {
  const row = await prisma.maintenanceMode.upsert({
    where: { id: SINGLETON_ID },
    update: {
      enabled: params.enabled,
      message: params.message,
      startAt: params.startAt,
      endAt: params.endAt,
      updatedById: params.updatedById,
    },
    create: {
      id: SINGLETON_ID,
      enabled: params.enabled,
      message: params.message,
      startAt: params.startAt,
      endAt: params.endAt,
      updatedById: params.updatedById,
    },
  });
  const status: MaintenanceStatus = {
    enabled: row.enabled,
    message: row.message,
    startAt: row.startAt ? row.startAt.toISOString() : null,
    endAt: row.endAt ? row.endAt.toISOString() : null,
  };
  cache = { status, fetchedAt: Date.now() };
  return status;
}
