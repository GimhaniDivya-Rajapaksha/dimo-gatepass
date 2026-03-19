import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/service-orders?gatePassId=xxx  — list orders for a gate pass
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gatePassId = new URL(req.url).searchParams.get("gatePassId");
  if (!gatePassId) return NextResponse.json({ error: "gatePassId required" }, { status: 400 });

  const orders = await prisma.serviceOrder.findMany({
    where: { gatePassId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ orders });
}

// POST /api/service-orders  — add an order to a gate pass
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CASHIER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { gatePassId, orderId, orderStatus, payTerm } = body;

  if (!gatePassId || !orderId) {
    return NextResponse.json({ error: "gatePassId and orderId required" }, { status: 400 });
  }

  const order = await prisma.serviceOrder.create({
    data: {
      gatePassId,
      orderId: String(orderId),
      orderStatus: orderStatus || "Open",
      payTerm: payTerm || "Immediate",
      isAssigned: false,
    },
  });

  return NextResponse.json({ order }, { status: 201 });
}

// PATCH /api/service-orders  — assign/unassign an order OR bulk proceed (complete / send to approver)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CASHIER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();

  // Bulk assign: { gatePassId, assignedIds: string[], action: "assign" }
  if (body.action === "assign") {
    const { gatePassId, assignedIds } = body as { gatePassId: string; assignedIds: string[] };

    // Set isAssigned = true for assignedIds, false for all others in this pass
    await prisma.serviceOrder.updateMany({
      where: { gatePassId, id: { in: assignedIds } },
      data: { isAssigned: true },
    });
    await prisma.serviceOrder.updateMany({
      where: { gatePassId, id: { notIn: assignedIds } },
      data: { isAssigned: false },
    });

    return NextResponse.json({ ok: true });
  }

  // Proceed: { gatePassId, action: "proceed" }
  // Cashier clears their immediate-payment orders and signals their part is done.
  // If creditApproved is also true (or hasCredit = false), move to APPROVED for Security Officer.
  if (body.action === "proceed") {
    const { gatePassId } = body as { gatePassId: string };

    const allOrders = await prisma.serviceOrder.findMany({ where: { gatePassId } });
    const immediateTerms = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction"];
    const hasCredit = allOrders.some((o) => {
      const t = (o.payTerm || "").toLowerCase().trim();
      return t !== "" && !immediateTerms.includes(t);
    });
    const detectedPaymentType = hasCredit ? "CREDIT" : "CASH";

    // Mark cashier's part as done
    await prisma.$executeRaw`UPDATE "GatePass" SET "cashierCleared" = true WHERE id = ${gatePassId}`;

    // Fetch the updated pass to check creditApproved
    const updatedPass = await (prisma.gatePass as any).findUnique({ where: { id: gatePassId } });
    const creditApprovedDone = updatedPass?.creditApproved === true || updatedPass?.hasCredit === false;

    let newStatus: string;
    let gatePassRecord: { gatePassNumber: string; vehicle: string; createdById: string } | null = null;

    if (creditApprovedDone) {
      // Both done → APPROVED → Security Officer
      gatePassRecord = await prisma.gatePass.update({
        where: { id: gatePassId },
        data: { status: "APPROVED", paymentType: detectedPaymentType } as any,
        select: { gatePassNumber: true, vehicle: true, createdById: true },
      });
      newStatus = "APPROVED";

      // Notify pass creator
      await prisma.notification.create({
        data: {
          userId: (gatePassRecord as any).createdById,
          type: "GATE_PASS_APPROVED",
          title: "Payment Cleared — Awaiting Security Gate Release",
          message: `${(gatePassRecord as any).gatePassNumber} (${(gatePassRecord as any).vehicle}) — all checks complete. Security Officer will confirm Gate OUT.`,
          gatePassId,
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
            message: `${(gatePassRecord as any).gatePassNumber} (${(gatePassRecord as any).vehicle}) — payment cleared. Please confirm gate release.`,
            gatePassId,
          })),
        });
      }
    } else {
      // Cashier done but credit approval still pending
      gatePassRecord = await (prisma.gatePass as any).findUnique({
        where: { id: gatePassId },
        select: { gatePassNumber: true, vehicle: true, createdById: true },
      });
      newStatus = "CASHIER_REVIEW"; // stays, waiting for approver

      // Notify initiator that cashier is done, waiting for approver
      if (gatePassRecord) {
        await prisma.notification.create({
          data: {
            userId: (gatePassRecord as any).createdById,
            type: "GATE_PASS_SUBMITTED",
            title: "Cashier Done — Awaiting Credit Approval",
            message: `${(gatePassRecord as any).gatePassNumber} — cashier has cleared immediate orders. Waiting for approver to review credit orders.`,
            gatePassId,
          },
        });
      }
    }

    return NextResponse.json({ ok: true, status: newStatus, creditPending: !creditApprovedDone });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE /api/service-orders?id=xxx  — remove an order
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CASHIER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.serviceOrder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
