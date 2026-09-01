// Next.js server-startup hook — runs once when the server process boots.
// Starts the Test Drive overdue-reminder scheduler and the daily SAP reconciliation check.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTestDriveReminderScheduler } = await import("./lib/testDriveReminderScheduler");
    startTestDriveReminderScheduler();

    const { startSapReconciliationScheduler } = await import("./lib/sapReconciliationScheduler");
    startSapReconciliationScheduler();
  }
}
