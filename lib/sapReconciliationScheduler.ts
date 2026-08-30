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
//  - The actual SAP write runs TWICE daily, at fixed times (currently 4:00 PM and 11:00 PM —
//    easy to retune below). Same principle each run: re-checks every outstanding vehicle
//    against SAP directly first, emails the just-refreshed "writing now" list (distinct
//    wording from the 8:00 PM email), then writes every vehicle that's actually eligible
//    right now (same chronological A→B→C chain-write logic as the manual "Write to SAP"
//    button). Both runs share the exact same logic (runAutoWriteReadyVehicles) — only the
//    scheduled time differs, each with its own once-per-day guard.
//  - Both the email and the write recipients come from the Admin-configured "SAP Reconciliation
//    Notifications" list (Master Data page) — never the CD Notifications list, which is
//    completely separate.
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const POLL_INTERVAL_MS = 5 * 60 * 1000; // how often we check whether it's time for the daily email/write(s)

const EMAIL_HOUR = 20, EMAIL_MINUTE = 0; // TEMPORARY test time ("8:00 PM") — change before go-live
const WRITE_HOUR_1 = 16, WRITE_MINUTE_1 = 0; // "4:00 PM" auto-write run
const WRITE_HOUR_2 = 23, WRITE_MINUTE_2 = 0; // "11:00 PM" auto-write run (unchanged)

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
const WRITE_TIME_LABEL_1 = formatTimeLabel(WRITE_HOUR_1, WRITE_MINUTE_1);
const WRITE_TIME_LABEL_2 = formatTimeLabel(WRITE_HOUR_2, WRITE_MINUTE_2);

async function runHourlyCheck() {
  try {
    const result = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Automatic Reconciliation)",
      mode: "AUTO",
    });
    console.log(`[SapReconciliation] hourly check — ${result.checked} checked, ${result.newlyReady} newly ready (Initiator notified now; list email at ${EMAIL_TIME_LABEL}, write at ${WRITE_TIME_LABEL_1} and ${WRITE_TIME_LABEL_2})`);
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
    const sent = await sendPendingWriteTonightDigest(recipients, WRITE_TIME_LABEL_2);
    console.log(`[SapReconciliation] daily list email (${EMAIL_TIME_LABEL}) — ${sent ? "sent" : "skipped (nothing ready)"}`);
  } catch (e) {
    console.error("[SapReconciliation] daily list email failed:", e);
  }
}

// 4:00 PM auto-write run — same fresh re-check → writing-now email → write-all-eligible flow
// as the 11:00 PM run below, just on its own schedule and its own once-per-day guard.
async function maybeRunDailyWrite1() {
  const now = new Date();
  if (!pastTarget(now, WRITE_HOUR_1, WRITE_MINUTE_1)) return;

  const g = globalThis as unknown as { __sapReconWriteDay1?: string };
  const today = dateKey(now);
  if (g.__sapReconWriteDay1 === today) return; // already ran today
  g.__sapReconWriteDay1 = today;

  try {
    const recipients = await getSapReconciliationRecipientEmails();
    const result = await runAutoWriteReadyVehicles(recipients);
    console.log(
      `[SapReconciliation] daily auto-write (${WRITE_TIME_LABEL_1}) — ${result.written} written, ${result.noLongerEligible} no longer eligible, ${result.failed} failed (of ${result.attempted} attempted)`
    );
  } catch (e) {
    console.error("[SapReconciliation] daily auto-write (4:00 PM) failed:", e);
  }
}

// 11:00 PM auto-write run — unchanged flow, kept exactly as it was.
async function maybeRunDailyWrite2() {
  const now = new Date();
  if (!pastTarget(now, WRITE_HOUR_2, WRITE_MINUTE_2)) return;

  const g = globalThis as unknown as { __sapReconWriteDay2?: string };
  const today = dateKey(now);
  if (g.__sapReconWriteDay2 === today) return; // already ran today
  g.__sapReconWriteDay2 = today;

  try {
    const recipients = await getSapReconciliationRecipientEmails();
    const result = await runAutoWriteReadyVehicles(recipients);
    console.log(
      `[SapReconciliation] daily auto-write (${WRITE_TIME_LABEL_2}) — ${result.written} written, ${result.noLongerEligible} no longer eligible, ${result.failed} failed (of ${result.attempted} attempted)`
    );
  } catch (e) {
    console.error("[SapReconciliation] daily auto-write (11:00 PM) failed:", e);
  }
}

export function startSapReconciliationScheduler() {
  const g = globalThis as unknown as { __sapReconSchedulerStarted?: boolean };
  if (g.__sapReconSchedulerStarted) return; // guard against duplicate intervals (e.g. dev hot-reload)
  g.__sapReconSchedulerStarted = true;

  console.log(`[SapReconciliation] scheduler started — check every 1 hour, list email daily at ${EMAIL_TIME_LABEL} (fresh re-check first), auto-write daily at ${WRITE_TIME_LABEL_1} and ${WRITE_TIME_LABEL_2} (fresh re-check first each time)`);
  void runHourlyCheck();
  void maybeRunDailyEmail();
  void maybeRunDailyWrite1();
  void maybeRunDailyWrite2();
  setInterval(() => { void runHourlyCheck(); }, CHECK_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyEmail(); }, POLL_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyWrite1(); }, POLL_INTERVAL_MS);
  setInterval(() => { void maybeRunDailyWrite2(); }, POLL_INTERVAL_MS);
}
