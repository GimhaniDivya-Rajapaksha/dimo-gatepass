import { runReconciliationCheck, runAutoWriteReadyVehicles } from "@/lib/sap-reconciliation";

// Automatic SAP Reconciliation — mirrors the in-process interval pattern already used by
// testDriveReminderScheduler.ts (started once via instrumentation.ts, no external cron /
// Windows Task Scheduler needed).
//
// Two separate schedules:
//  - Check runs every hour: re-verifies SAP status for all pending vehicles, and — the
//    moment a vehicle newly reaches QP60 — emails the fixed Admin recipient list that it's
//    scheduled to be written tonight (see runReconciliationCheck in lib/sap-reconciliation.ts).
//    This notification always goes out well BEFORE any SAP write happens.
//  - The actual SAP write runs once daily, at a fixed time (currently 11:59 PM — easy to
//    retune below), writing every vehicle that reached QP60 (same chronological A→B→C
//    chain-write logic as the manual "Write to SAP" button).
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const POLL_INTERVAL_MS = 5 * 60 * 1000; // how often we check whether it's time for the daily write

const WRITE_HOUR = 23, WRITE_MINUTE = 59; // TEMPORARY test time ("11:59 PM") — change before go-live

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function pastTarget(now: Date, hour: number, minute: number): boolean {
  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

async function runHourlyCheck() {
  try {
    const result = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Automatic Reconciliation)",
      mode: "AUTO",
    });
    console.log(`[SapReconciliation] hourly check — ${result.checked} checked, ${result.newlyReady} newly ready (notified now, writes tonight at 11:59 PM)`);
  } catch (e) {
    console.error("[SapReconciliation] hourly check failed:", e);
  }
}

async function maybeRunDailyWrite() {
  const now = new Date();
  if (!pastTarget(now, WRITE_HOUR, WRITE_MINUTE)) return;

  const g = globalThis as unknown as { __sapReconWriteDay?: string };
  const today = dateKey(now);
  if (g.__sapReconWriteDay === today) return; // already ran today
  g.__sapReconWriteDay = today;

  try {
    const result = await runAutoWriteReadyVehicles();
    console.log(
      `[SapReconciliation] daily auto-write (11:59 PM) — ${result.written} written, ${result.noLongerEligible} no longer eligible, ${result.failed} failed (of ${result.attempted} attempted)`
    );
  } catch (e) {
    console.error("[SapReconciliation] daily auto-write failed:", e);
  }
}

export function startSapReconciliationScheduler() {
  const g = globalThis as unknown as { __sapReconSchedulerStarted?: boolean };
  if (g.__sapReconSchedulerStarted) return; // guard against duplicate intervals (e.g. dev hot-reload)
  g.__sapReconSchedulerStarted = true;

  console.log("[SapReconciliation] scheduler started — check every 1 hour, auto-write daily at 11:59 PM");
  void runHourlyCheck();
  void maybeRunDailyWrite();
  setInterval(() => { void runHourlyCheck(); }, CHECK_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyWrite(); }, POLL_INTERVAL_MS);
}
