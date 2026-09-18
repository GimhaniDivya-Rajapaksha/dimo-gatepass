import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

// Short in-memory cache — every page checks this on every load, so we avoid a DB round-trip
// per request. Admin toggling on/off writes through and clears the cache immediately.
const CACHE_TTL_MS = 3_000;
let cache: { enabled: boolean; fetchedAt: number } | null = null;

export async function isSystemNoticeEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.enabled;

  const row = await prisma.systemNotice.findUnique({ where: { id: SINGLETON_ID } }).catch(() => null);
  const enabled = row?.enabled ?? false;
  cache = { enabled, fetchedAt: now };
  return enabled;
}

export async function setSystemNoticeEnabled(params: { enabled: boolean; updatedById: string | null }): Promise<boolean> {
  const row = await prisma.systemNotice.upsert({
    where: { id: SINGLETON_ID },
    update: { enabled: params.enabled, updatedById: params.updatedById },
    create: { id: SINGLETON_ID, enabled: params.enabled, updatedById: params.updatedById },
  });
  cache = { enabled: row.enabled, fetchedAt: Date.now() };
  return row.enabled;
}
