import { syncPlantCacheFromSap } from "@/lib/plant-cache";

// Automatic SAP /plant cache sync — mirrors the in-process interval pattern already used by
// lib/sapReconciliationScheduler.ts (started once via instrumentation.ts, no external cron /
// Windows Task Scheduler needed).
//
// Runs once daily at a fixed time (midnight, 00:00). An Admin can also trigger a sync at any
// time via the Master Data "Plant/Material Cache" tab's "Sync Now" button
// (app/api/admin/plant-cache/route.ts) — this scheduler only owns the automatic side.
const POLL_INTERVAL_MS = 5 * 60 * 1000; // how often we check whether it's time for the daily sync
const SYNC_HOUR = 0, SYNC_MINUTE = 0; // midnight

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function pastTarget(now: Date, hour: number, minute: number): boolean {
  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

async function maybeRunDailySync() {
  const now = new Date();
  if (!pastTarget(now, SYNC_HOUR, SYNC_MINUTE)) return;

  const g = globalThis as unknown as { __plantCacheSyncDay?: string };
  const today = dateKey(now);
  if (g.__plantCacheSyncDay === today) return; // already ran today
  g.__plantCacheSyncDay = today;

  try {
    const result = await syncPlantCacheFromSap({ trigger: "AUTO", triggeredById: null });
    console.log(`[PlantCache] automatic midnight sync — ${result.vehicleCount} vehicles, ${result.locationCount} locations`);
  } catch (e) {
    console.error("[PlantCache] automatic midnight sync failed:", e);
  }
}

export function startPlantCacheScheduler() {
  const g = globalThis as unknown as { __plantCacheSchedulerStarted?: boolean };
  if (g.__plantCacheSchedulerStarted) return; // guard against duplicate intervals (e.g. dev hot-reload)
  g.__plantCacheSchedulerStarted = true;

  console.log("[PlantCache] scheduler started — automatic sync daily at midnight, manual sync available anytime via Admin");
  void maybeRunDailySync();
  setInterval(() => { void maybeRunDailySync(); }, POLL_INTERVAL_MS);
}
