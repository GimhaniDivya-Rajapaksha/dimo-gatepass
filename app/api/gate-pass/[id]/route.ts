import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findApproversForLocationBrand } from "@/lib/approver-routing";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gatePass = await prisma.gatePass.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, defaultLocation: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ gatePass });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // ── Initiator changes approver on a PENDING_APPROVAL pass ──────────────
  if (body.action === "initiator_reassign") {
    const role = session.user.role;
    if (role !== "INITIATOR" && role !== "AREA_SALES_OFFICER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const current = await prisma.gatePass.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ error: "Can only reassign a pending-approval gate pass" }, { status: 400 });
    }
    if (current.createdById !== session.user.id) {
      return NextResponse.json({ error: "You can only edit your own gate passes" }, { status: 403 });
    }

    const newApproverName: string = (body.newApprover ?? "").trim();
    const reason: string = (body.reason ?? "").trim();
    if (!newApproverName) return NextResponse.json({ error: "New approver is required" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Reason for change is required" }, { status: 400 });

    // Derive who the old approver was — use existing previousApprover chain or the approver field
    const oldApproverName = (current as any).approver as string | null
      ?? (current as any).previousApprover as string | null
      ?? "Previous Approver";

    // Update the gate pass — chassis is intentionally excluded
    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        previousApprover: oldApproverName,
        approverChangeReason: reason,
        ...(body.departureDate   !== undefined ? { departureDate:   body.departureDate   || null } : {}),
        ...(body.departureTime   !== undefined ? { departureTime:   body.departureTime   || null } : {}),
        ...(body.arrivalDate     !== undefined ? { arrivalDate:     body.arrivalDate     || null } : {}),
        ...(body.arrivalTime     !== undefined ? { arrivalTime:     body.arrivalTime     || null } : {}),
        ...(body.toLocation      !== undefined ? { toLocation:      body.toLocation      || null } : {}),
        ...(body.fromLocation    !== undefined ? { fromLocation:    body.fromLocation    || null } : {}),
        ...(body.outReason       !== undefined ? { outReason:       body.outReason       || null } : {}),
        ...(body.requestedBy     !== undefined ? { requestedBy:     body.requestedBy     || null } : {}),
        ...(body.transportMode   !== undefined ? { transportMode:   body.transportMode   || null } : {}),
        ...(body.companyName     !== undefined ? { companyName:     body.companyName     || null } : {}),
        ...(body.carrierRegNo    !== undefined ? { carrierRegNo:    body.carrierRegNo    || null } : {}),
        ...(body.driverName      !== undefined ? { driverName:      body.driverName      || null } : {}),
        ...(body.driverNIC       !== undefined ? { driverNIC:       body.driverNIC       || null } : {}),
        ...(body.driverContact   !== undefined ? { driverContact:   body.driverContact   || null } : {}),
        ...(body.mileage         !== undefined ? { mileage:         body.mileage         || null } : {}),
        ...(body.insurance       !== undefined ? { insurance:       body.insurance       || null } : {}),
        ...(body.garagePlate     !== undefined ? { garagePlate:     body.garagePlate     || null } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    const gp = updated as typeof updated & { approver?: string; previousApprover?: string; approverChangeReason?: string };

    // Notify old approver that pass was redirected away from them
    try {
      const oldApprovers = await findApproversForLocationBrand(current.fromLocation, oldApproverName, current.make);
      if (oldApprovers.length > 0) {
        await prisma.notification.createMany({
          data: oldApprovers.map((a) => ({
            userId: a.id,
            type: "GATE_PASS_REASSIGNED_AWAY",
            title: "Gate Pass Redirected",
            message: `Gate pass ${current.gatePassNumber} that was submitted to you has been redirected to ${newApproverName}. Reason: ${reason}`,
            gatePassId: id,
          })),
        });
      }
    } catch { /* non-critical */ }

    // Notify new approver
    try {
      const newApprovers = await findApproversForLocationBrand(current.fromLocation, newApproverName, current.make);
      if (newApprovers.length > 0) {
        await prisma.notification.createMany({
          data: newApprovers.map((a) => ({
            userId: a.id,
            type: "GATE_PASS_REASSIGNED_TO",
            title: "Gate Pass Assigned to You",
            message: `Gate pass ${current.gatePassNumber} has been assigned to you (previously submitted to ${oldApproverName}). Reason: ${reason}`,
            gatePassId: id,
          })),
        });
      }
    } catch { /* non-critical */ }

    return NextResponse.json({ gatePass: updated });
  }

  // ── Approver edits transport details ────────────────────────────────────
  if (session.user.role !== "APPROVER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const gatePass = await prisma.gatePass.update({
    where: { id },
    data: {
      transportMode: body.transportMode || null,
      companyName:   body.companyName   || null,
      carrierName:   body.carrierName   || null,
      carrierRegNo:  body.carrierRegNo  || null,
      driverName:    body.driverName    || null,
      driverNIC:     body.driverNIC     || null,
      driverContact: body.driverContact || null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ gatePass });
}
