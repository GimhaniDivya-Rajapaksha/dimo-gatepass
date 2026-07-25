import { prisma } from "@/lib/prisma";
import { sendTestDriveOverdueInitiatorEmail, sendTestDriveOverdueManagerEmail } from "@/lib/email";

// Test Drive only — checks for vehicles overdue on return and sends a one-time
// overdue email once neither the Initiator's "Arrived" action nor Security's
// "Gate In" action has happened within 60 minutes of the ACTUAL Gate Out time
// (both actions move the pass off GATE_OUT, so this query naturally stops
// matching a pass the moment either one completes it). Runs in-process inside
// the same long-lived server (started once via instrumentation.ts), so it
// requires no external cron / Windows Task Scheduler setup.
//
// The 60-minute window is measured from the actual Gate Out moment, never from
// the Return Time / Expected Arrival Time entered on the create form. Every
// action that puts a Test Drive pass into GATE_OUT (print_gate_out — the only
// one Test Drive uses — see status/route.ts) overwrites departureDate/
// departureTime with the real timestamp of that action, so those two fields
// are exactly the "actual Gate Out time" once status is GATE_OUT.
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const OVERDUE_GRACE_MS = 60 * 60 * 1000; // 60 minutes past actual Gate Out time

async function checkOverdueTestDrives() {
  try {
    const now = new Date();
    const candidates = await prisma.gatePass.findMany({
      where: {
        passType: "TEST_DRIVE",
        status: "GATE_OUT",
        reminderSentAt: null,
        departureDate: { not: null },
        departureTime: { not: null },
      },
      select: {
        id: true,
        gatePassNumber: true,
        vehicle: true,
        customerName: true,
        driverName: true,
        departureDate: true,
        departureTime: true,
        returnTime: true,
        requestedBy: true,
        requestedByEmail: true,
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
      if (!pass.departureDate || !pass.departureTime) continue;
      const gateOutAt = new Date(`${pass.departureDate}T${pass.departureTime}:00`);
      if (Number.isNaN(gateOutAt.getTime())) continue;
      if (now.getTime() < gateOutAt.getTime() + OVERDUE_GRACE_MS) continue; // not yet 60 min since Gate Out

      const initiator = pass.createdBy;
      const approver1 = initiator.approver;
      const details = {
        gatePassNumber: pass.gatePassNumber,
        passId: pass.id,
        vehicle: pass.vehicle,
        customerName: pass.customerName,
        driverName: pass.driverName,
        initiatorName: initiator.name,
        returnTime: pass.returnTime,
      };

      // Send once per unique email address — Requested By is very often the
      // Initiator themselves, and should not receive a duplicate copy.
      const sentTo = new Set<string>();
      const sendOnce = async (
        email: string | null | undefined,
        name: string | null | undefined,
        send: (toEmail: string, toName: string, pass: typeof details) => Promise<void>,
        label: string
      ) => {
        const key = email?.trim().toLowerCase();
        if (!key || sentTo.has(key)) return;
        sentTo.add(key);
        try {
          await send(email!.trim(), name?.trim() || "Team", details);
        } catch (e) {
          console.error(`[TestDriveReminder] ${label} email failed:`, e);
        }
      };

      await sendOnce(initiator.email, initiator.name, sendTestDriveOverdueInitiatorEmail, "initiator");
      if (approver1) await sendOnce(approver1.email, approver1.name, sendTestDriveOverdueManagerEmail, "approver1");
      if (pass.requestedByEmail) await sendOnce(pass.requestedByEmail, pass.requestedBy, sendTestDriveOverdueManagerEmail, "requestedBy");

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
