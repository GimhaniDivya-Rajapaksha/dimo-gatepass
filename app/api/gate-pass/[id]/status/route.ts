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

  // INITIATOR: mark as gate out (only for their own APPROVED passes)
  if (action === "gate_out") {
    if (session.user.role !== "INITIATOR") {
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

    // Notify all RECIPIENTs
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

    return NextResponse.json({ gatePass: updated });
  }

  // RECIPIENT: confirm vehicle received (gate in = completed)
  if (action === "gate_in") {
    if (session.user.role !== "RECIPIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "GATE_OUT") {
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
