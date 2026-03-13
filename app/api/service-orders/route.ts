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
  // If ALL orders assigned → COMPLETED
  // If some unassigned → PENDING_APPROVAL (send to approver)
  if (body.action === "proceed") {
    const { gatePassId } = body as { gatePassId: string };

    const [total, unassigned] = await Promise.all([
      prisma.serviceOrder.count({ where: { gatePassId } }),
      prisma.serviceOrder.count({ where: { gatePassId, isAssigned: false } }),
    ]);

    if (total === 0) {
      return NextResponse.json({ error: "No orders added yet. Please add orders first." }, { status: 400 });
    }

    const allPaid = unassigned === 0;
    // All paid → GATE_OUT (vehicle authorized to leave; INITIATOR/ASO must confirm receipt via gate_in → COMPLETED)
    // Partial  → PENDING_APPROVAL (send to approver)
    const newStatus = allPaid ? "GATE_OUT" : "PENDING_APPROVAL";

    await prisma.gatePass.update({
      where: { id: gatePassId },
      data: { status: newStatus },
    });

    // If sending to approver, notify all APPROVERs
    if (!allPaid) {
      const approvers = await prisma.user.findMany({ where: { role: "APPROVER" } });
      const pass = await prisma.gatePass.findUnique({ where: { id: gatePassId }, select: { gatePassNumber: true, vehicle: true } });
      if (approvers.length > 0 && pass) {
        await prisma.notification.createMany({
          data: approvers.map((a) => ({
            userId: a.id,
            type: "GATE_PASS_SUBMITTED",
            title: "Partial Payment — Approval Required",
            message: `${pass.gatePassNumber} (${pass.vehicle}) has unpaid orders and requires approval.`,
            gatePassId,
          })),
        });
      }
    }

    return NextResponse.json({ ok: true, status: newStatus, allPaid });
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
