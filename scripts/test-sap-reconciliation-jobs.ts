/**
 * Manually fires the SAP Reconciliation jobs on demand, for testing — without waiting for
 * the real schedule (hourly check, daily list email at 3 PM, daily write at 12:30 PM).
 *
 * Run one at a time:
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts check   — re-check SAP status for all pending; notifies the
 *                                                              Initiator (once) for anything newly Ready
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts email   — send the "Ready for SAP Write" list email now,
 *                                                              to the Admin-configured recipient list (same as the
 *                                                              real 3 PM job)
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts write   — run the auto-write pass now (ignores the 12:30 PM gate).
 *                                                              This itself re-checks all pending vehicles against SAP
 *                                                              fresh, emails the just-refreshed ready list, then writes
 *                                                              every vehicle that's actually eligible right now.
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts cycle   — an explicit check + email, followed by "write" above
 *                                                              (which repeats its own check + email internally) — for
 *                                                              testing only, the real schedule keeps these apart.
 */
import { runReconciliationCheck, runAutoWriteReadyVehicles, sendPendingWriteTonightDigest } from "../lib/sap-reconciliation";
import { getSapReconciliationRecipientEmails } from "../lib/sap-reconciliation-recipients";

async function main() {
  const job = process.argv[2];

  if (job === "check") {
    const result = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Manual Test Trigger)",
      mode: "MANUAL",
    });
    console.log("Check result:", result);
  } else if (job === "email") {
    const recipients = await getSapReconciliationRecipientEmails();
    const sent = await sendPendingWriteTonightDigest(recipients);
    console.log(sent ? "List email sent." : "Nothing ready — no email sent.");
  } else if (job === "write") {
    const recipients = await getSapReconciliationRecipientEmails();
    const result = await runAutoWriteReadyVehicles(recipients);
    console.log("Auto-write result:", result);
  } else if (job === "cycle") {
    const checkResult = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Manual Test Trigger)",
      mode: "MANUAL",
    });
    console.log("Check result:", checkResult);
    const recipients = await getSapReconciliationRecipientEmails();
    const sent = await sendPendingWriteTonightDigest(recipients);
    console.log(sent ? "List email sent." : "Nothing ready — no email sent.");
    const writeResult = await runAutoWriteReadyVehicles(recipients);
    console.log("Auto-write result:", writeResult);
  } else {
    console.log('Usage: npx tsx scripts/test-sap-reconciliation-jobs.ts <check|email|write|cycle>');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
