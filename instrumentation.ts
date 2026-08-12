// Next.js server-startup hook — runs once when the server process boots.
// Used only to start the Test Drive overdue-reminder scheduler; nothing else.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTestDriveReminderScheduler } = await import("./lib/testDriveReminderScheduler");
    startTestDriveReminderScheduler();
  }
}
