import { prisma } from "@/lib/prisma";
import { sendTestDriveOverdueInitiatorEmail, sendTestDriveOverdueManagerEmail } from "@/lib/email";

// Test Drive only — checks for overdue vehicles and sends a one-time reminder
// email to the Initiator and their Reporting Manager. Runs in-process inside
// the same long-lived server (started once via instrumentation.ts), so it
// requires no external cron / Windows Task Scheduler setup.
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function checkOverdueTestDrives() {
  try {
    const now = new Date();
    const candidates = await prisma.gatePass.findMany({
      where: {
        passType: "TEST_DRIVE",
        status: "GATE_OUT",
        reminderSentAt: null,
        returnDate: { not: null },
        returnTime: { not: null },
      },
      select: {
        id: true,
        gatePassNumber: true,
        vehicle: true,
        customerName: true,
        driverName: true,
        returnDate: true,
        returnTime: true,
        createdBy: {
          select: {
            name: true,
            email: true,
            approver: { select: { name: true, email: true } },
          },
        },
      },
    });

    for (const pass of candidates) {
      if (!pass.returnDate || !pass.returnTime) continue;
      const scheduledReturn = new Date(`${pass.returnDate}T${pass.returnTime}:00`);
      if (Number.isNaN(scheduledReturn.getTime()) || scheduledReturn > now) continue;

      const initiator = pass.createdBy;
      const manager = initiator.approver;
      const details = {
        gatePassNumber: pass.gatePassNumber,
        passId: pass.id,
        vehicle: pass.vehicle,
        customerName: pass.customerName,
        driverName: pass.driverName,
        initiatorName: initiator.name,
        returnTime: pass.returnTime,
      };

      try {
        await sendTestDriveOverdueInitiatorEmail(initiator.email, initiator.name, details);
      } catch (e) {
        console.error("[TestDriveReminder] initiator email failed:", e);
      }

      if (manager) {
        try {
          await sendTestDriveOverdueManagerEmail(manager.email, manager.name, details);
        } catch (e) {
          console.error("[TestDriveReminder] manager email failed:", e);
        }
      }

      // Send-once: stamp reminderSentAt so this pass is never re-checked/re-sent.
      await prisma.gatePass.update({
        where: { id: pass.id },
        data: { reminderSentAt: now },
      });
    }
  } catch (e) {
    console.error("[TestDriveReminder] check failed:", e);
  }
}

export function startTestDriveReminderScheduler() {
  const g = globalThis as unknown as { __testDriveReminderStarted?: boolean };
  if (g.__testDriveReminderStarted) return; // guard against duplicate intervals (e.g. dev hot-reload)
  g.__testDriveReminderStarted = true;

  console.log("[TestDriveReminder] scheduler started — checking every 5 minutes");
  void checkOverdueTestDrives();
  setInterval(() => { void checkOverdueTestDrives(); }, CHECK_INTERVAL_MS);
}
