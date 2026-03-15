import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, rejectionReason, mismatch, mismatchNote, receivedChassis } = body;

  const gatePass = await prisma.gatePass.findUnique({ where: { id } });
  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // APPROVER: approve or reject
  if (action === "approve" || action === "reject") {
    if (session.user.role !== "APPROVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    // All approvals → APPROVED; initiator/ASO will then Mark as OUT from the detail page
    const newStatus = action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: newStatus,
        approvedById: session.user.id,
        approvedAt: new Date(),
        rejectionReason: action === "reject" ? (rejectionReason || null) : null,
      },
    });

    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: action === "approve" ? "GATE_PASS_APPROVED" : "GATE_PASS_REJECTED",
        title: action === "approve" ? "Gate Pass Approved" : "Gate Pass Rejected",
        message:
          action === "approve"
            ? `Your gate pass ${gatePass.gatePassNumber} has been approved.`
            : `Your gate pass ${gatePass.gatePassNumber} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
        gatePassId: gatePass.id,
      },
    });

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR / AREA_SALES_OFFICER: mark as gate out (only for their own APPROVED passes)
  if (action === "gate_out") {
    const canGateOut = session.user.role === "INITIATOR" || session.user.role === "AREA_SALES_OFFICER";
    if (!canGateOut) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (gatePass.status !== "APPROVED") {
      return NextResponse.json({ error: "Gate pass must be approved first" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      data: { status: "GATE_OUT" },
    });

    // For AFTER_SALES: notify based on sub-type
    if (gatePass.passType === "AFTER_SALES") {
      // SUB_IN gated out by ASO: notify the parent MAIN_IN creator (INITIATOR) that vehicle arrived at service center
      if (gatePass.passSubType === "SUB_IN" && gatePass.parentPassId) {
        const parentPass = await (prisma.gatePass as any).findUnique({
          where: { id: gatePass.parentPassId },
          select: { createdById: true },
        });
        if (parentPass?.createdById) {
          await prisma.notification.create({
            data: {
              userId: parentPass.createdById,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Arrived at Service Center",
              message: `${gatePass.gatePassNumber} — vehicle has arrived at the service center. Please confirm receipt.`,
              gatePassId: gatePass.id,
            },
          });
        }
      }
      // SUB_OUT_IN going back to main location: notify the parent MAIN_IN creator
      if (gatePass.passSubType === "SUB_OUT_IN" && gatePass.parentPassId) {
        const parentPass = await (prisma.gatePass as any).findUnique({
          where: { id: gatePass.parentPassId },
          select: { createdById: true },
        });
        if (parentPass?.createdById) {
          await prisma.notification.create({
            data: {
              userId: parentPass.createdById,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle En Route Back",
              message: `${gatePass.gatePassNumber} — vehicle is heading back to your location. Please mark as arrived when received.`,
              gatePassId: gatePass.id,
            },
          });
        }
      }
      // SUB_OUT: vehicle leaving DIMO HQ to sub-location — notify RECIPIENTs to confirm gate exit
      if (gatePass.passSubType === "SUB_OUT") {
        const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((r) => ({
              userId: r.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Heading to Sub-Location",
              message: `Gate pass ${gatePass.gatePassNumber} — vehicle is heading to a sub-location. Please confirm gate exit.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
      // MAIN_OUT: vehicle being released to customer — notify RECIPIENTs to confirm gate exit
      if (gatePass.passSubType === "MAIN_OUT") {
        const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((r) => ({
              userId: r.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Being Released to Customer",
              message: `Gate pass ${gatePass.gatePassNumber} — vehicle is being released. Please confirm gate exit.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
      // MAIN_IN: vehicle is heading to DIMO service center — notify RECIPIENTs (gate officers) to confirm arrival
      if (gatePass.passSubType === "MAIN_IN") {
        const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((r) => ({
              userId: r.id,
              type: "GATE_PASS_RECEIVED",
              title: "Service Vehicle En Route",
              message: `Gate pass ${gatePass.gatePassNumber} — service/repair vehicle is on the way. Please confirm when vehicle arrives.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
    } else {
      // Non-AFTER_SALES: notify all RECIPIENTs
      const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((r) => ({
            userId: r.id,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle En Route",
            message: `Gate pass ${gatePass.gatePassNumber} has been marked as Gate Out. Vehicle is on the way.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // RECIPIENT / INITIATOR / AREA_SALES_OFFICER: confirm vehicle received (gate in = completed)
  if (action === "gate_in") {
    // RECIPIENT can only gate_in passes at the HQ gate: non-AFTER_SALES, MAIN_IN, MAIN_OUT, SUB_OUT
    // SUB_IN and SUB_OUT_IN are handled by INITIATOR/ASO — not by gate officers
    const recipientAllowed = session.user.role === "RECIPIENT"
      && (gatePass.passType !== "AFTER_SALES"
          || ["MAIN_IN", "MAIN_OUT", "SUB_OUT"].includes(gatePass.passSubType ?? ""));
    const canGateIn = recipientAllowed
      || ((session.user.role === "INITIATOR" || session.user.role === "AREA_SALES_OFFICER") && gatePass.passType === "AFTER_SALES");
    if (!canGateIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    // AFTER_SALES sub-passes (SUB_IN, SUB_OUT_IN) can go APPROVED → COMPLETED directly (no gate_out step needed)
    const allowDirectComplete = gatePass.passType === "AFTER_SALES"
      && ["SUB_IN", "SUB_OUT_IN"].includes(gatePass.passSubType ?? "");
    if (gatePass.status !== "GATE_OUT" && !(allowDirectComplete && gatePass.status === "APPROVED")) {
      return NextResponse.json({ error: "Gate pass must be Gate Out first" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "COMPLETED",
        ...(receivedChassis ? { chassis: receivedChassis } : {}),
        ...(mismatchNote ? { comments: `[MISMATCH] ${mismatchNote}` } : {}),
      },
    });

    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_RECEIVED",
        title: "Vehicle Received",
        message: `Gate pass ${gatePass.gatePassNumber} confirmed received.${mismatch ? " A details mismatch was noted." : ""}`,
        gatePassId: gatePass.id,
      },
    });

    // SUB_OUT COMPLETED (RECIPIENT confirmed vehicle left HQ) → notify all ASOs to create SUB IN
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_OUT") {
      const asoUsers = await prisma.user.findMany({ where: { role: "AREA_SALES_OFFICER" } });
      if (asoUsers.length > 0) {
        await prisma.notification.createMany({
          data: asoUsers.map((a) => ({
            userId: a.id,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Departed — Create SUB IN",
            message: `Gate pass ${gatePass.gatePassNumber} — vehicle has left DIMO HQ and is heading your way. Please create SUB IN when it arrives.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR / AREA_SALES_OFFICER: resubmit a rejected pass
  if (action === "resubmit") {
    const canResubmit = session.user.role === "INITIATOR" || session.user.role === "AREA_SALES_OFFICER";
    if (!canResubmit) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (gatePass.status !== "REJECTED") {
      return NextResponse.json({ error: "Only rejected passes can be resubmitted" }, { status: 400 });
    }

    const { resubmitNote, departureDate, departureTime } = body;
    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        resubmitCount: (gatePass.resubmitCount ?? 0) + 1,
        resubmitNote: resubmitNote || null,
        ...(departureDate ? { departureDate } : {}),
        ...(departureTime ? { departureTime } : {}),
      },
    });

    // Notify all approvers
    const approvers = await prisma.user.findMany({ where: { role: "APPROVER" } });
    if (approvers.length > 0) {
      await prisma.notification.createMany({
        data: approvers.map((a) => ({
          userId: a.id,
          type: "GATE_PASS_RESUBMITTED",
          title: "Gate Pass Resubmitted",
          message: `Gate pass ${gatePass.gatePassNumber} was resubmitted after rejection and needs your review.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR: cancel their own PENDING_APPROVAL pass
  if (action === "cancel") {
    if (session.user.role !== "INITIATOR" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (gatePass.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ error: "Only pending passes can be cancelled" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: "CANCELLED" as any },
    });

    return NextResponse.json({ gatePass: updated });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
