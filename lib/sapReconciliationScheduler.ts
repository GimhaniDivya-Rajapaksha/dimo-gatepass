import { runReconciliationCheck, runAutoWriteReadyVehicles, sendPendingWriteTonightDigest } from "@/lib/sap-reconciliation";

// Automatic SAP Reconciliation — mirrors the in-process interval pattern already used by
// testDriveReminderScheduler.ts (started once via instrumentation.ts, no external cron /
// Windows Task Scheduler needed).
//
// Three separate schedules:
//  - Check runs every hour: re-verifies SAP status for all pending vehicles and notifies
//    the Initiator (once) the moment their vehicle newly reaches QP60.
//  - The Gimhani/Tharindhi "ready to write" list is sent once daily, at a fixed time
//    (currently 3:00 PM), listing everything currently Ready at that moment — independent
//    of which hourly check found it.
//  - The actual SAP write runs once daily, at a fixed time (currently 11:59 PM — easy to
//    retune below), writing every vehicle that reached QP60 (same chronological A→B→C
//    chain-write logic as the manual "Write to SAP" button). Always after the email, since
//    3 PM < 11:59 PM.
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const POLL_INTERVAL_MS = 5 * 60 * 1000; // how often we check whether it's time for the daily email/write

const EMAIL_HOUR = 15, EMAIL_MINUTE = 0; // TEMPORARY test time ("3:00 PM") — change before go-live
const WRITE_HOUR = 23, WRITE_MINUTE = 59; // TEMPORARY test time ("11:59 PM") — change before go-live

const DIGEST_RECIPIENTS = ["gimhani.rajapaksha@dimolanka.com", "tharindhi.pathirana@dimolanka.com"];

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
    console.log(`[SapReconciliation] hourly check — ${result.checked} checked, ${result.newlyReady} newly ready (Initiator notified now; list email at 3 PM, write at 11:59 PM)`);
  } catch (e) {
    console.error("[SapReconciliation] hourly check failed:", e);
  }
}

async function maybeRunDailyEmail() {
  const now = new Date();
  if (!pastTarget(now, EMAIL_HOUR, EMAIL_MINUTE)) return;

  const g = globalThis as unknown as { __sapReconEmailDay?: string };
  const today = dateKey(now);
  if (g.__sapReconEmailDay === today) return; // already ran today
  g.__sapReconEmailDay = today;

  try {
    const sent = await sendPendingWriteTonightDigest(DIGEST_RECIPIENTS);
    console.log(`[SapReconciliation] daily list email (3 PM) — ${sent ? "sent" : "skipped (nothing ready)"}`);
  } catch (e) {
    console.error("[SapReconciliation] daily list email failed:", e);
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

  console.log("[SapReconciliation] scheduler started — check every 1 hour, list email daily at 3 PM, auto-write daily at 11:59 PM");
  void runHourlyCheck();
  void maybeRunDailyEmail();
  void maybeRunDailyWrite();
  setInterval(() => { void runHourlyCheck(); }, CHECK_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyEmail(); }, POLL_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyWrite(); }, POLL_INTERVAL_MS);
}
