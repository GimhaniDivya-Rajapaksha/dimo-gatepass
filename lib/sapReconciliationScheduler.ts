import { runReconciliationCheck, runAutoWriteReadyVehicles, sendPendingWriteTonightDigest } from "@/lib/sap-reconciliation";
import { getSapReconciliationRecipientEmails } from "@/lib/sap-reconciliation-recipients";

// Automatic SAP Reconciliation — mirrors the in-process interval pattern already used by
// testDriveReminderScheduler.ts (started once via instrumentation.ts, no external cron /
// Windows Task Scheduler needed).
//
// Schedules:
//  - Check runs every hour: re-verifies SAP status for all pending vehicles and notifies
//    the Initiator (once) the moment their vehicle newly reaches QP60.
//  - The Gimhani/Tharindhi "ready to write" list is sent once daily at a fixed time (3:00 PM,
//    unchanged), listing everything currently Ready at that moment — independent of which
//    hourly check found it.
//  - TEMPORARY, FOR TESTING ONLY: the exact same "ready to write" email is also sent again at
//    12:00 PM (noon) — see TEST_NOON_EMAIL_HOUR/MINUTE below, remove this second send once
//    testing is done.
//  - The actual SAP write runs once daily, at a fixed time (currently 12:30 PM for testing —
//    easy to retune below, change to 11:59 PM before go-live). It never trusts whatever the
//    last hourly check happened to find: it re-checks every outstanding vehicle against SAP
//    directly first (so nothing eligible between hourly checks gets missed), emails the
//    just-refreshed "writing now" list before writing anything, then writes every vehicle
//    that's actually eligible right now (same chronological A→B→C chain-write logic as the
//    manual "Write to SAP" button).
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const POLL_INTERVAL_MS = 5 * 60 * 1000; // how often we check whether it's time for the daily email/write

const EMAIL_HOUR = 15, EMAIL_MINUTE = 0; // existing "ready to write" list email — unchanged (3:00 PM)
const TEST_NOON_EMAIL_HOUR = 12, TEST_NOON_EMAIL_MINUTE = 0; // TEMPORARY, testing only — remove after testing
const WRITE_HOUR = 12, WRITE_MINUTE = 30; // TEMPORARY test time ("12:30 PM") — change to 23,59 before go-live

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function pastTarget(now: Date, hour: number, minute: number): boolean {
  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

function formatTimeLabel(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

const WRITE_TIME_LABEL = formatTimeLabel(WRITE_HOUR, WRITE_MINUTE);

async function runHourlyCheck() {
  try {
    const result = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Automatic Reconciliation)",
      mode: "AUTO",
    });
    console.log(`[SapReconciliation] hourly check — ${result.checked} checked, ${result.newlyReady} newly ready (Initiator notified now; list email at 3 PM, write at ${WRITE_TIME_LABEL})`);
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
    const recipients = await getSapReconciliationRecipientEmails();
    const sent = await sendPendingWriteTonightDigest(recipients, WRITE_TIME_LABEL);
    console.log(`[SapReconciliation] daily list email (3 PM) — ${sent ? "sent" : "skipped (nothing ready)"}`);
  } catch (e) {
    console.error("[SapReconciliation] daily list email failed:", e);
  }
}

// TEMPORARY, testing only — exact same email/content as the 3 PM job above, fired an
// additional time at noon so the "ready to write" list can be checked mid-test-cycle without
// waiting for 3 PM. Remove this whole function + its interval once testing is done.
async function maybeRunTestNoonEmail() {
  const now = new Date();
  if (!pastTarget(now, TEST_NOON_EMAIL_HOUR, TEST_NOON_EMAIL_MINUTE)) return;

  const g = globalThis as unknown as { __sapReconTestNoonEmailDay?: string };
  const today = dateKey(now);
  if (g.__sapReconTestNoonEmailDay === today) return; // already ran today
  g.__sapReconTestNoonEmailDay = today;

  try {
    const recipients = await getSapReconciliationRecipientEmails();
    const sent = await sendPendingWriteTonightDigest(recipients, WRITE_TIME_LABEL);
    console.log(`[SapReconciliation] TEST noon list email (12:00 PM) — ${sent ? "sent" : "skipped (nothing ready)"}`);
  } catch (e) {
    console.error("[SapReconciliation] TEST noon list email failed:", e);
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
    const recipients = await getSapReconciliationRecipientEmails();
    const result = await runAutoWriteReadyVehicles(recipients);
    console.log(
      `[SapReconciliation] daily auto-write (${WRITE_TIME_LABEL}) — ${result.written} written, ${result.noLongerEligible} no longer eligible, ${result.failed} failed (of ${result.attempted} attempted)`
    );
  } catch (e) {
    console.error("[SapReconciliation] daily auto-write failed:", e);
  }
}

export function startSapReconciliationScheduler() {
  const g = globalThis as unknown as { __sapReconSchedulerStarted?: boolean };
  if (g.__sapReconSchedulerStarted) return; // guard against duplicate intervals (e.g. dev hot-reload)
  g.__sapReconSchedulerStarted = true;

  console.log(`[SapReconciliation] scheduler started — check every 1 hour, list email daily at 3 PM (+ TEST noon send), auto-write daily at ${WRITE_TIME_LABEL}`);
  void runHourlyCheck();
  void maybeRunDailyEmail();
  void maybeRunTestNoonEmail();
  void maybeRunDailyWrite();
  setInterval(() => { void runHourlyCheck(); }, CHECK_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyEmail(); }, POLL_INTERVAL_MS);
  setInterval(() => { void maybeRunTestNoonEmail(); }, POLL_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyWrite(); }, POLL_INTERVAL_MS);
}
