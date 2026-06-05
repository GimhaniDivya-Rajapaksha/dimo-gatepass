import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendApprovalRequestEmail } from "@/lib/email";
import { findApproversForLocationBrand } from "@/lib/approver-routing";
import { fetchSapOrders } from "@/lib/sap";

// PATCH /api/gate-pass/[id]/to-main-out
// Converts an existing MAIN_IN pass (in COMPLETED state) to the MAIN_OUT phase
// in-place — same GP number, same record, no new pass created.
// Also accepts a SUB_IN id (ASO path): resolves to the root MAIN_IN automatically.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const allowed = ["INITIATOR", "AREA_SALES_OFFICER", "SERVICE_ADVISOR"];
  if (!session || !allowed.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { toLocation, departureDate, departureTime, requestedBy, driverName, carrierRegNo, comments } = body;

  if (!toLocation?.trim()) {
    return NextResponse.json({ error: "Destination is required" }, { status: 400 });
  }

  // Load the pass — if it's a SUB_IN, resolve to the root MAIN_IN via parentPassId
  let pass = await (prisma.gatePass as any).findUnique({ where: { id } });
  if (!pass) return NextResponse.json({ error: "Pass not found" }, { status: 404 });

  if (pass.passType !== "AFTER_SALES") {
    return NextResponse.json({ error: "Only After Sales passes can be converted to MAIN_OUT" }, { status: 400 });
  }

  // If given a SUB_IN pass, resolve to its root MAIN_IN parent
  if (pass.passSubType === "SUB_IN" && pass.parentPassId) {
    pass = await (prisma.gatePass as any).findUnique({ where: { id: pass.parentPassId } });
    if (!pass) return NextResponse.json({ error: "Parent MAIN_IN pass not found" }, { status: 404 });
  }

  if (pass.passSubType !== "MAIN_IN") {
    return NextResponse.json({ error: "Pass must be a MAIN_IN to convert to MAIN_OUT" }, { status: 400 });
  }

  if (!["COMPLETED", "GATE_OUT", "APPROVED"].includes(pass.status)) {
    return NextResponse.json({ error: "MAIN_IN must have Gate IN confirmed before issuing MAIN_OUT" }, { status: 400 });
  }

  // Determine payment routing via SAP orders
  const immediateTerms = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction"];
  let hasImmediate = false;
  let hasCredit = false;
  let nextStatus = "CASHIER_REVIEW";

  try {
    const sapOrders = await fetchSapOrders(pass.chassis ?? "", pass.vehicle ?? "", "");
    const active = (sapOrders ?? []).filter((o: any) => !o.cancelled && o.orderId);
    hasImmediate = active.some((o: any) => immediateTerms.includes((o.payTerm || o.payTermCode || "").toLowerCase().trim()));
    hasCredit    = active.some((o: any) => {
      const t = (o.payTerm || o.payTermCode || "").toLowerCase().trim();
      return t !== "" && !immediateTerms.includes(t);
    });
  } catch { /* SAP unavailable — route to cashier review as safe default */ }

  if (!hasImmediate && hasCredit) nextStatus = "PENDING_APPROVAL";

  // Convert the MAIN_IN pass → MAIN_OUT in-place
  const updated = await (prisma.gatePass as any).update({
    where: { id: pass.id },
    data: {
      passSubType:    "MAIN_OUT",
      status:         nextStatus,
      toLocation:     toLocation.trim(),
      fromLocation:   pass.toLocation ?? pass.fromLocation ?? null, // service center becomes the departure point
      departureDate:  departureDate  || null,
      departureTime:  departureTime  || null,
      requestedBy:    requestedBy?.trim()  || null,
      driverName:     driverName?.trim()   || null,
      carrierRegNo:   carrierRegNo?.trim() || null,
      comments:       comments?.trim()     || null,
      // Reset payment flags for the MAIN_OUT leg
      hasImmediate,
      hasCredit,
      cashierCleared:  !hasImmediate,
      creditApproved:  !hasCredit,
      paymentType: hasImmediate && hasCredit ? "MIXED" : hasImmediate ? "IMMEDIATE" : hasCredit ? "CREDIT" : "CASH",
    },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  // Notify cashiers when immediate payment orders exist
  if (nextStatus === "CASHIER_REVIEW") {
    const cashiers = await prisma.user.findMany({ where: { role: "CASHIER" as any } });
    if (cashiers.length > 0) {
      await prisma.notification.createMany({
        data: cashiers.map((c: { id: string }) => ({
          userId: c.id,
          type: "CASHIER_REVIEW_REQUIRED",
          title: "Order Review Required",
          message: `${pass.gatePassNumber} (${pass.vehicle}) — After Sales MAIN OUT. Please review service orders.`,
          gatePassId: pass.id,
        })),
      });
    }
  }

  // Notify approvers when credit-only orders exist
  if (nextStatus === "PENDING_APPROVAL") {
    const approvers = await findApproversForLocationBrand(pass.toLocation || pass.fromLocation || null, undefined, pass.make);
    if (approvers.length > 0) {
      await prisma.notification.createMany({
        data: approvers.map((a: { id: string }) => ({
          userId: a.id,
          type: "GATE_PASS_SUBMITTED",
          title: "After Sales MAIN OUT — Approval Required",
          message: `${session.user.name} issued MAIN OUT for ${pass.gatePassNumber} (${pass.vehicle}). Please review credit orders.`,
          gatePassId: pass.id,
        })),
      });
      try {
        for (const a of approvers as any[]) {
          await sendApprovalRequestEmail(a.email, a.name, pass.id, {
            gatePassNumber: pass.gatePassNumber, passType: "AFTER_SALES", passSubType: "MAIN_OUT",
            vehicle: pass.vehicle, chassis: pass.chassis, toLocation: toLocation.trim(),
            fromLocation: pass.toLocation ?? null, departureDate, departureTime,
            createdByName: session.user.name || "Unknown",
          }, a.id);
        }
      } catch { /* non-fatal */ }
    }
  }

  // Notify the original creator
  await prisma.notification.create({
    data: {
      userId: pass.createdById,
      type: "GATE_PASS_SUBMITTED",
      title: "MAIN OUT Issued",
      message: `${pass.gatePassNumber} (${pass.vehicle}) has been converted to MAIN OUT and sent for ${nextStatus === "CASHIER_REVIEW" ? "cashier review" : "approval"}.`,
      gatePassId: pass.id,
    },
  });

  return NextResponse.json({ gatePass: updated });
}
