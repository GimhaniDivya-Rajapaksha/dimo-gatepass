import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendApprovalRequestEmail } from "@/lib/email";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const allowed = ["INITIATOR", "AREA_SALES_OFFICER", "SERVICE_ADVISOR"];
  if (!session || !allowed.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const pass = await (prisma.gatePass as any).findUnique({ where: { id } });
  if (!pass || pass.status !== "DRAFT") {
    return NextResponse.json({ error: "Pass not found or not in DRAFT status" }, { status: 404 });
  }

  const body = await req.json();
  const {
    toLocation, fromLocation, departureDate, departureTime,
    arrivalDate, arrivalTime, approver, outReason, comments,
    passSubType, serviceJobNo,
  } = body;

  // Determine next status (same routing logic as create)
  let nextStatus = "PENDING_APPROVAL";
  const isAfterSalesSubPass = pass.passType === "AFTER_SALES" &&
    ["MAIN_IN", "SUB_IN", "SUB_OUT", "SUB_OUT_IN"].includes(passSubType ?? "");

  if (isAfterSalesSubPass) nextStatus = "APPROVED";
  if (pass.passType === "AFTER_SALES" && passSubType === "MAIN_OUT") nextStatus = "CASHIER_REVIEW";

  // Find approver user if provided
  let approvedById: string | null = null;
  let approvedAt: Date | null = null;
  if (isAfterSalesSubPass) {
    approvedById = session.user.id;
    approvedAt = new Date();
  }

  const updated = await (prisma.gatePass as any).update({
    where: { id },
    data: {
      status:        nextStatus,
      toLocation:    toLocation    || null,
      fromLocation:  fromLocation  || null,
      departureDate: departureDate || null,
      departureTime: departureTime || null,
      arrivalDate:   arrivalDate   || null,
      arrivalTime:   arrivalTime   || null,
      outReason:     outReason     || null,
      comments:      comments      || null,
      passSubType:   passSubType   || null,
      serviceJobNo:  serviceJobNo  || null,
      ...(approvedById ? { approvedById, approvedAt } : {}),
    },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  // Notify the security officer who created it
  await prisma.notification.create({
    data: {
      userId:     pass.createdById,
      type:       "GATE_PASS_SUBMITTED",
      title:      "Gate Pass Completed",
      message:    `${pass.gatePassNumber} (${pass.vehicle}) has been completed by ${session.user.name} and submitted for ${nextStatus === "CASHIER_REVIEW" ? "cashier review" : "approval"}.`,
      gatePassId: id,
    },
  });

  // Notify approvers (if going to PENDING_APPROVAL)
  if (nextStatus === "PENDING_APPROVAL") {
    let approverUsers = approver
      ? await prisma.user.findMany({ where: { role: "APPROVER", name: { equals: approver, mode: "insensitive" } } })
      : await prisma.user.findMany({ where: { role: "APPROVER" } });
    if (approver && approverUsers.length === 0) approverUsers = await prisma.user.findMany({ where: { role: "APPROVER" } });

    if (approverUsers.length > 0) {
      await prisma.notification.createMany({
        data: approverUsers.map((a: { id: string }) => ({
          userId: a.id, type: "GATE_PASS_SUBMITTED",
          title: "New Gate Pass for Approval",
          message: `${session.user.name} completed ${pass.gatePassNumber} (${pass.vehicle}) — please review and approve.`,
          gatePassId: id,
        })),
      });
      try {
        const createdByUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } });
        for (const a of approverUsers as any[]) {
          await sendApprovalRequestEmail(a.email, a.name, id, {
            gatePassNumber: pass.gatePassNumber, passType: pass.passType, passSubType,
            vehicle: pass.vehicle, chassis: pass.chassis, toLocation, fromLocation,
            departureDate, departureTime, createdByName: createdByUser?.name || session.user.name || "Unknown",
          });
        }
      } catch { /* non-fatal */ }
    }
  }

  // Notify cashiers (if MAIN_OUT → CASHIER_REVIEW)
  if (nextStatus === "CASHIER_REVIEW") {
    const cashiers = await prisma.user.findMany({ where: { role: "CASHIER" as any } });
    if (cashiers.length > 0) {
      await prisma.notification.createMany({
        data: cashiers.map((c: { id: string }) => ({
          userId: c.id, type: "CASHIER_REVIEW_REQUIRED",
          title: "Order Review Required",
          message: `${pass.gatePassNumber} (${pass.vehicle}) — After Sales MAIN_OUT. Please review service orders.`,
          gatePassId: id,
        })),
      });
    }
  }

  return NextResponse.json({ gatePass: updated });
}
