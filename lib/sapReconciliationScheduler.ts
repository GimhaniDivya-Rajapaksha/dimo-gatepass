import { runReconciliationCheck, runAutoWriteReadyVehicles, sendPendingWriteTonightDigest } from "@/lib/sap-reconciliation";
import { getSapReconciliationRecipientEmails } from "@/lib/sap-reconciliation-recipients";

// Automatic SAP Reconciliation — mirrors the in-process interval pattern already used by
// testDriveReminderScheduler.ts (started once via instrumentation.ts, no external cron /
// Windows Task Scheduler needed).
//
// Schedules:
//  - Check runs every hour: re-verifies SAP status for all pending vehicles and notifies
//    the Initiator (once) the moment their vehicle newly reaches QP60.
//  - The "ready to write" list email runs once daily at a fixed time (currently 8:00 PM for
//    testing — easy to retune below). It never trusts whatever the last hourly check happened
//    to find: it re-checks every outstanding vehicle against SAP directly first, then emails
//    the just-refreshed list — so nothing eligible between hourly checks gets missed.
//  - The actual SAP write runs once daily, at a fixed time (currently 11:00 PM for testing —
//    easy to retune below). Same principle: re-checks every outstanding vehicle against SAP
//    directly first, emails the just-refreshed "writing now" list (distinct wording from the
//    8:00 PM email), then writes every vehicle that's actually eligible right now (same
//    chronological A→B→C chain-write logic as the manual "Write to SAP" button).
//  - Both the email and the write recipients come from the Admin-configured "SAP Reconciliation
//    Notifications" list (Master Data page) — never the CD Notifications list, which is
//    completely separate.
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const POLL_INTERVAL_MS = 5 * 60 * 1000; // how often we check whether it's time for the daily email/write

const EMAIL_HOUR = 20, EMAIL_MINUTE = 0; // TEMPORARY test time ("8:00 PM") — change before go-live
const WRITE_HOUR = 23, WRITE_MINUTE = 0; // TEMPORARY test time ("11:00 PM") — change before go-live

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

const EMAIL_TIME_LABEL = formatTimeLabel(EMAIL_HOUR, EMAIL_MINUTE);
const WRITE_TIME_LABEL = formatTimeLabel(WRITE_HOUR, WRITE_MINUTE);

async function runHourlyCheck() {
  try {
    const result = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Automatic Reconciliation)",
      mode: "AUTO",
    });
    console.log(`[SapReconciliation] hourly check — ${result.checked} checked, ${result.newlyReady} newly ready (Initiator notified now; list email at ${EMAIL_TIME_LABEL}, write at ${WRITE_TIME_LABEL})`);
  } catch (e) {
    console.error("[SapReconciliation] hourly check failed:", e);
  }
}

// Re-checks every outstanding vehicle against SAP directly (never trusts the last hourly
// check's saved result), then emails the Admin-configured SAP Reconciliation recipient list
// with the just-refreshed "ready to write" list.
async function maybeRunDailyEmail() {
  const now = new Date();
  if (!pastTarget(now, EMAIL_HOUR, EMAIL_MINUTE)) return;

  const g = globalThis as unknown as { __sapReconEmailDay?: string };
  const today = dateKey(now);
  if (g.__sapReconEmailDay === today) return; // already ran today
  g.__sapReconEmailDay = today;

  try {
    await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Automatic Reconciliation — pre-email check)",
      mode: "AUTO",
    });
    const recipients = await getSapReconciliationRecipientEmails();
    const sent = await sendPendingWriteTonightDigest(recipients, WRITE_TIME_LABEL);
    console.log(`[SapReconciliation] daily list email (${EMAIL_TIME_LABEL}) — ${sent ? "sent" : "skipped (nothing ready)"}`);
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

  console.log(`[SapReconciliation] scheduler started — check every 1 hour, list email daily at ${EMAIL_TIME_LABEL} (fresh re-check first), auto-write daily at ${WRITE_TIME_LABEL} (fresh re-check first)`);
  void runHourlyCheck();
  void maybeRunDailyEmail();
  void maybeRunDailyWrite();
  setInterval(() => { void runHourlyCheck(); }, CHECK_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyEmail(); }, POLL_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyWrite(); }, POLL_INTERVAL_MS);
}
