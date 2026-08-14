/**
 * Manually fires the SAP Reconciliation jobs on demand, for testing — without waiting for
 * the real schedule (hourly check, daily list email at 3 PM, daily write at 11:59 PM).
 *
 * Run one at a time:
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts check   — re-check SAP status for all pending; notifies the
 *                                                              Initiator (once) for anything newly Ready
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts email   — send the "Ready for SAP Write" list email now,
 *                                                              to the fixed Admin list (same as the real 3 PM job)
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts write   — run the auto-write pass now (ignores the 11:59 PM gate —
 *                                                              writes whatever is currently Ready, for testing)
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts cycle   — check, then email, then write, all immediately (for
 *                                                              testing only — the real schedule keeps these apart)
 */
import { runReconciliationCheck, runAutoWriteReadyVehicles, sendPendingWriteTonightDigest } from "../lib/sap-reconciliation";

const DIGEST_RECIPIENTS = ["gimhani.rajapaksha@dimolanka.com", "tharindi.pathirana@dimolanka.com"];

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
    const sent = await sendPendingWriteTonightDigest(DIGEST_RECIPIENTS);
    console.log(sent ? "List email sent." : "Nothing ready — no email sent.");
  } else if (job === "write") {
    const result = await runAutoWriteReadyVehicles();
    console.log("Auto-write result:", result);
  } else if (job === "cycle") {
    const checkResult = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Manual Test Trigger)",
      mode: "MANUAL",
    });
    console.log("Check result:", checkResult);
    const sent = await sendPendingWriteTonightDigest(DIGEST_RECIPIENTS);
    console.log(sent ? "List email sent." : "Nothing ready — no email sent.");
    const writeResult = await runAutoWriteReadyVehicles();
    console.log("Auto-write result:", writeResult);
  } else {
    console.log('Usage: npx tsx scripts/test-sap-reconciliation-jobs.ts <check|email|write|cycle>');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
