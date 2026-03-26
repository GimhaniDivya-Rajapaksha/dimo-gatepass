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

  const gatePass = await (prisma.gatePass as any).findUnique({ where: { id } });
  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // APPROVER: approve credit portion of MAIN_OUT (parallel with cashier)
  if (action === "credit_approve") {
    if (session.user.role !== "APPROVER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.passSubType !== "MAIN_OUT") {
      return NextResponse.json({ error: "credit_approve only valid for MAIN_OUT" }, { status: 400 });
    }

    // Mark credit as approved
    await prisma.$executeRaw`UPDATE "GatePass" SET "creditApproved" = true, "approvedById" = ${session.user.id}, "approvedAt" = NOW() WHERE id = ${id}`;

    // Check if cashierCleared
    const updatedPass = await (prisma.gatePass as any).findUnique({ where: { id } });
    const cashierDone = updatedPass?.cashierCleared === true || updatedPass?.hasImmediate === false;

    if (cashierDone) {
      // Both done → APPROVED
      await prisma.gatePass.update({
        where: { id },
        data: { status: "APPROVED" },
      });

      // Notify pass creator
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_APPROVED",
          title: "All Checks Complete — Awaiting Security Gate Release",
          message: `Gate pass ${gatePass.gatePassNumber} — credit approved and payment cleared. Security Officer will confirm Gate OUT.`,
          gatePassId: gatePass.id,
        },
      });

      // Notify Security Officers
      const securityOfficers = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
      if (securityOfficers.length > 0) {
        await prisma.notification.createMany({
          data: securityOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Vehicle Cleared — Ready for Gate OUT",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — credit approved & cash cleared. Please confirm gate release.`,
            gatePassId: gatePass.id,
          })),
        });
      }
      return NextResponse.json({ ok: true, status: "APPROVED" });
    } else {
      // Credit approved but waiting for cashier
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_SUBMITTED",
          title: "Credit Approved — Awaiting Cashier Clearance",
          message: `Gate pass ${gatePass.gatePassNumber} — credit orders approved. Waiting for cashier to clear immediate payment orders.`,
          gatePassId: gatePass.id,
        },
      });
      return NextResponse.json({ ok: true, status: "CASHIER_REVIEW" });
    }
  }

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

    // If MAIN_OUT was CREDIT approved → notify Security Officers that vehicle is ready for gate release
    if (action === "approve" && gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_OUT") {
      const securityOfficers = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
      if (securityOfficers.length > 0) {
        await prisma.notification.createMany({
          data: securityOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Vehicle Cleared — Ready for Gate OUT",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — credit approved. Please confirm gate release.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // SECURITY_OFFICER: confirm Gate IN for GATE_OUT MAIN_IN / SUB_OUT_IN passes, APPROVED SUB_IN, or Customer Delivery
  if (action === "security_gate_in") {
    if (session.user.role !== "SECURITY_OFFICER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const isMainIn   = gatePass.passSubType === "MAIN_IN";
    const isSubOutIn = gatePass.passSubType === "SUB_OUT_IN";
    const isSubIn    = gatePass.passSubType === "SUB_IN";
    const isCd       = gatePass.passType === "CUSTOMER_DELIVERY";

    // SUB_IN: confirmed at APPROVED (Security B confirms vehicle entered ASO compound)
    // Others: confirmed at GATE_OUT
    const validSubIn = isSubIn && gatePass.passType === "AFTER_SALES" && gatePass.status === "APPROVED";
    const validGateOut = gatePass.status === "GATE_OUT" && (isMainIn || isSubOutIn || isCd);
    if (!validSubIn && !validGateOut) {
      return NextResponse.json({ error: "Not eligible for Security Gate IN confirmation" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "COMPLETED",
        ...(body.receivedChassis ? { chassis: body.receivedChassis } : {}),
        ...(body.mismatchNote ? { comments: `[MISMATCH] ${body.mismatchNote}` } : {}),
      },
    });

    // Notify pass creator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_RECEIVED",
        title: isCd ? "Delivery Complete — Security Confirmed Gate IN"
          : isSubOutIn ? "Vehicle Returned — Security Confirmed Gate IN"
          : isSubIn ? "Vehicle Received at Sub-Location — Security Confirmed"
          : "Vehicle Arrived — Security Confirmed Gate IN",
        message: isCd
          ? `${gatePass.gatePassNumber} — Security Officer confirmed customer delivery is complete.`
          : isSubOutIn
          ? `${gatePass.gatePassNumber} — Security Officer confirmed vehicle returned to DIMO via Gate IN.`
          : isSubIn
          ? `${gatePass.gatePassNumber} — Security Officer confirmed vehicle has entered the sub-location compound.`
          : `${gatePass.gatePassNumber} — Security Officer confirmed vehicle arrival at the gate.`,
        gatePassId: gatePass.id,
      },
    });

    // For SUB_IN: notify the Initiator who created the parent MAIN_IN pass
    if (isSubIn && gatePass.parentPassId) {
      const parentPass = await (prisma.gatePass as any).findUnique({
        where: { id: gatePass.parentPassId },
        select: { createdById: true },
      });
      if (parentPass?.createdById && parentPass.createdById !== gatePass.createdById) {
        await prisma.notification.create({
          data: {
            userId: parentPass.createdById,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Arrived at Sub-Location",
            message: `${gatePass.gatePassNumber} — Security Officer confirmed vehicle has entered the sub-location. ASO will return it when ready.`,
            gatePassId: gatePass.id,
          },
        });
      }
    }

    // For SUB_OUT_IN: also notify the Initiator who created the original (parent) pass
    if (isSubOutIn && gatePass.parentPassId) {
      const parentPass = await (prisma.gatePass as any).findUnique({
        where: { id: gatePass.parentPassId },
        select: { createdById: true },
      });
      if (parentPass?.createdById && parentPass.createdById !== gatePass.createdById) {
        await prisma.notification.create({
          data: {
            userId: parentPass.createdById,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Returned — Security Confirmed Gate IN",
            message: `${gatePass.gatePassNumber} — Vehicle has returned to DIMO. Security Officer confirmed Gate IN.`,
            gatePassId: gatePass.id,
          },
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // SECURITY_OFFICER: confirm Gate OUT for any APPROVED pass (or INITIATOR_OUT for SUB_OUT two-step)
  if (action === "security_gate_out") {
    if (session.user.role !== "SECURITY_OFFICER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "APPROVED" && gatePass.status !== "INITIATOR_OUT") {
      return NextResponse.json({ error: "Gate pass must be APPROVED or initiator-confirmed" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "GATE_OUT",
        ...(mismatchNote ? { comments: `[MISMATCH] ${mismatchNote}` } : {}),
      },
    });

    // Always notify creator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_APPROVED",
        title: "Security Confirmed Gate OUT",
        message: `${gatePass.gatePassNumber} — Security Officer confirmed Gate OUT. Vehicle has been released.`,
        gatePassId: gatePass.id,
      },
    });

    // Notify RECIPIENTs for Location Transfer (they need to confirm arrival)
    if (gatePass.passType === "LOCATION_TRANSFER") {
      const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((r) => ({
            userId: r.id,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Departing — Confirm Gate IN When It Arrives",
            message: `Gate pass ${gatePass.gatePassNumber} — Security confirmed Gate OUT. Please confirm when vehicle arrives at destination.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    // For After Sales MAIN_OUT: notify RECIPIENTs
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_OUT") {
      const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((r) => ({
            userId: r.id,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Being Released to Customer",
            message: `Gate pass ${gatePass.gatePassNumber} — Security Officer confirmed vehicle release. Please confirm gate exit.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    // For After Sales SUB_OUT: notify ASOs that vehicle is heading their way
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_OUT") {
      const asoUsers = await prisma.user.findMany({ where: { role: "AREA_SALES_OFFICER" } });
      if (asoUsers.length > 0) {
        await prisma.notification.createMany({
          data: asoUsers.map((a: { id: string }) => ({
            userId: a.id,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Heading Your Way — Confirm Sub IN on Arrival",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Security confirmed Gate OUT. Vehicle is en route to your sub-location. Please confirm arrival.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR / AREA_SALES_OFFICER: mark as gate out (only for their own APPROVED passes, not MAIN_OUT — those go via Security Officer)
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
    // MAIN_OUT and LOCATION_TRANSFER passes must go through Security Officer directly
    if ((gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_OUT") || gatePass.passType === "LOCATION_TRANSFER") {
      return NextResponse.json({ error: "This pass must be released by Security Officer" }, { status: 403 });
    }

    // SUB_OUT: two-step — initiator confirms first (INITIATOR_OUT), then security confirms GATE_OUT
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_OUT") {
      const updated = await prisma.gatePass.update({
        where: { id },
        data: { status: "INITIATOR_OUT" as any },
      });
      // Notify Security Officers to confirm physical Gate OUT
      const securityOfficers = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
      if (securityOfficers.length > 0) {
        await prisma.notification.createMany({
          data: securityOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Sub OUT Ready — Confirm Gate Release",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Initiator confirmed vehicle departure. Please confirm Gate OUT at the security gate.`,
            gatePassId: gatePass.id,
          })),
        });
      }
      return NextResponse.json({ gatePass: updated });
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
      // SUB_OUT_IN going back to DIMO: notify the parent pass creator (Initiator) + Security Officers for Gate IN
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
              title: "Vehicle En Route Back — Awaiting Security Gate IN",
              message: `${gatePass.gatePassNumber} — Vehicle is heading back to DIMO. Security Officer will confirm Gate IN when it arrives.`,
              gatePassId: gatePass.id,
            },
          });
        }
        // Notify Security Officers to confirm Gate IN
        const securityOfficers = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
        if (securityOfficers.length > 0) {
          await prisma.notification.createMany({
            data: securityOfficers.map((s: { id: string }) => ({
              userId: s.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Returning — Confirm Gate IN",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Vehicle is returning from sub-location. Please confirm Gate IN when it arrives.`,
              gatePassId: gatePass.id,
            })),
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
      // MAIN_IN: vehicle is heading to DIMO service center — notify Security Officers to confirm Gate IN
      if (gatePass.passSubType === "MAIN_IN") {
        const securityOfficers = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
        if (securityOfficers.length > 0) {
          await prisma.notification.createMany({
            data: securityOfficers.map((s: { id: string }) => ({
              userId: s.id,
              type: "GATE_PASS_RECEIVED",
              title: "Service Vehicle Arriving — Confirm Gate IN",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — service/repair vehicle is on the way. Please confirm Gate IN when it arrives.`,
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
    // RECIPIENT can gate_in:
    //   - Non-AFTER_SALES (LOCATION_TRANSFER, CUSTOMER_DELIVERY): any pass at GATE_OUT
    //   - AFTER_SALES: only MAIN_IN, MAIN_OUT, SUB_OUT (not SUB_IN or SUB_OUT_IN)
    const recipientAllowed = session.user.role === "RECIPIENT"
      && (gatePass.passType !== "AFTER_SALES"
          || ["MAIN_IN", "MAIN_OUT", "SUB_OUT"].includes(gatePass.passSubType ?? ""));
    const canGateIn = recipientAllowed
      || ((session.user.role === "INITIATOR" || session.user.role === "AREA_SALES_OFFICER") && gatePass.passType === "AFTER_SALES");
    if (!canGateIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    // SUB_IN is confirmed by Security B (security_gate_in) — not directly by INITIATOR/ASO
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_IN" && gatePass.status === "APPROVED") {
      return NextResponse.json({ error: "SUB_IN gate confirmation must be done by Security Officer" }, { status: 403 });
    }
    // AFTER_SALES SUB_OUT_IN can go APPROVED → COMPLETED directly (no gate_out step needed)
    const allowDirectComplete = gatePass.passType === "AFTER_SALES"
      && gatePass.passSubType === "SUB_OUT_IN";
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

    // SUB_OUT COMPLETED (ASO confirmed vehicle arrived at sub-location) → notify Initiator
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_OUT") {
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_RECEIVED",
          title: "Vehicle Arrived at Sub-Location",
          message: `${gatePass.gatePassNumber} — Area Sales Officer confirmed vehicle arrived at sub-location. A return pass (Sub OUT) will be created when the vehicle is ready to come back.`,
          gatePassId: gatePass.id,
        },
      });
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
