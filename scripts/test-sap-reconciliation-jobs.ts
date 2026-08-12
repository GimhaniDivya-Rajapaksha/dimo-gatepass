/**
 * Manually fires the SAP Reconciliation jobs on demand, for testing — without waiting for
 * the real schedule (hourly check, daily write at 11:59 PM).
 *
 * Run one at a time:
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts check   — re-check SAP status for all pending; automatically emails
 *                                                              the fixed Admin list "pending write tonight" for anything
 *                                                              newly Ready (same as the real hourly job)
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts write   — run the auto-write pass now (ignores the 11:59 PM gate —
 *                                                              writes whatever is currently Ready, for testing)
 *   npx tsx scripts/test-sap-reconciliation-jobs.ts cycle   — check, then write immediately after (for testing only —
 *                                                              the real schedule keeps these hours apart)
 */
import { runReconciliationCheck, runAutoWriteReadyVehicles } from "../lib/sap-reconciliation";

async function main() {
  const job = process.argv[2];

  if (job === "check") {
    const result = await runReconciliationCheck({
      triggeredById: null,
      triggeredByName: "System (Manual Test Trigger)",
      mode: "MANUAL",
    });
    console.log("Check result:", result);
    if (result.newlyReady > 0) console.log(`${result.newlyReady} vehicle(s) newly ready — "pending write tonight" email sent to the fixed Admin list.`);
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
    const writeResult = await runAutoWriteReadyVehicles();
    console.log("Auto-write result:", writeResult);
  } else {
    console.log('Usage: npx tsx scripts/test-sap-reconciliation-jobs.ts <check|write|cycle>');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
