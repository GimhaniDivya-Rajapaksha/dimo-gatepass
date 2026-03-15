import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendApprovalRequestEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const passType = searchParams.get("passType");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const skip = (page - 1) * limit;

  const role = session.user.role;
  const where: Record<string, unknown> = {};

  if (role === "INITIATOR") {
    // INITIATOR sees own passes AND sub-passes linked to their main passes
    where.AND = [{
      OR: [
        { createdById: session.user.id },
        { parentPass: { createdById: session.user.id } },
      ]
    }];
  } else if (role === "AREA_SALES_OFFICER") {
    // ASO sees only their own passes — UNLESS locationView=true (Vehicles Incoming)
    // OR searching AFTER_SALES by GP number (to link passes created by other roles)
    const locationView = searchParams.get("locationView") === "true";
    const isAfterSalesSearch = searchParams.get("passType") === "AFTER_SALES" && searchParams.get("search");
    if (!locationView && !isAfterSalesSearch) {
      where.AND = [{
        OR: [
          { createdById: session.user.id },
          { parentPass: { createdById: session.user.id } },
        ]
      }];
    }
  }
  // APPROVER and ADMIN see all

  // toLocation filter (used by Vehicles Incoming to scope to this location)
  const toLocationFilter = searchParams.get("toLocation");
  if (toLocationFilter) where.toLocation = toLocationFilter;

  if (passType) where.passType = passType;

  const parentOnly = searchParams.get("parentOnly") === "true";
  if (passType === "AFTER_SALES" && parentOnly) {
    where.parentPassId = null;
  } else if (!passType && role !== "INITIATOR" && !status) {
    // In "All" view (no specific status filter), hide AFTER_SALES sub-passes to reduce clutter.
    // But when filtering by status (e.g. PENDING_APPROVAL for approver queue), show everything.
    where.NOT = { AND: [{ passType: "AFTER_SALES" }, { parentPassId: { not: null } }] };
  }

  if (role === "RECIPIENT") {
    // Recipients only see GATE_OUT and COMPLETED; honour further narrowing by ?status=
    const allowedStatuses = ["GATE_OUT", "COMPLETED"];
    where.status = status && allowedStatuses.includes(status)
      ? status
      : { in: allowedStatuses };
  } else if (status) {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { gatePassNumber: { contains: search, mode: "insensitive" } },
      { vehicle: { contains: search, mode: "insensitive" } },
      { chassis: { contains: search, mode: "insensitive" } },
      { requestedBy: { contains: search, mode: "insensitive" } },
    ];
  }

  const passSubType = searchParams.get("passSubType");
  if (passSubType) where.passSubType = passSubType;

  const [total, passes] = await Promise.all([
    prisma.gatePass.count({ where }),
    prisma.gatePass.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
        parentPass: { select: { id: true, gatePassNumber: true, passSubType: true, status: true, vehicle: true } },
        ...(passType === "AFTER_SALES" && parentOnly ? {
        subPasses: { select: { id: true, gatePassNumber: true, passSubType: true, status: true, toLocation: true, fromLocation: true, createdAt: true, departureDate: true }, orderBy: { createdAt: "asc" } }
      } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return NextResponse.json({ passes, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  const allowedRoles = ["INITIATOR", "AREA_SALES_OFFICER"];
  if (!session || !allowedRoles.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();

  // AREA_SALES_OFFICER can only create AFTER_SALES sub-passes
  if (session.user.role === "AREA_SALES_OFFICER") {
    if (body.passType !== "AFTER_SALES" || !["SUB_IN", "SUB_OUT", "SUB_OUT_IN", "MAIN_OUT"].includes(body.passSubType)) {
      return NextResponse.json({ error: "Area Sales Officer can only create After Sales sub-passes" }, { status: 403 });
    }
  }

  // After Sales status routing:
  // - MAIN_OUT → CASHIER_REVIEW (cashier checks orders; partial → PENDING_APPROVAL for approver)
  // - MAIN_IN / SUB_IN / SUB_OUT / SUB_OUT_IN → APPROVED directly (no approver needed for these sub-passes)
  // - All other pass types → PENDING_APPROVAL (normal approval flow)
  const isAfterSalesMainOut = body.passType === "AFTER_SALES" && body.passSubType === "MAIN_OUT";
  const isAfterSalesSubPass = body.passType === "AFTER_SALES" && ["MAIN_IN", "SUB_IN", "SUB_OUT", "SUB_OUT_IN"].includes(body.passSubType);

  // Use max existing number (not count) to avoid collisions after deletions
  const lastPass = await prisma.gatePass.findFirst({ orderBy: { gatePassNumber: "desc" } });
  const lastNum = lastPass ? parseInt(lastPass.gatePassNumber.replace(/^GP-/, ""), 10) || 0 : 0;
  const gatePassNumber = `GP-${String(lastNum + 1).padStart(4, "0")}`;

  const initialStatus = isAfterSalesSubPass ? "APPROVED" : "PENDING_APPROVAL";

  const createData: Record<string, unknown> = {
    gatePassNumber,
    passType: body.passType,
    status: initialStatus, // AFTER_SALES sub-passes auto-approved; update to CASHIER_REVIEW below for MAIN_OUT
    vehicle: body.vehicle || body.vehicleDetails || "Unknown",
    vehicleColor: body.vehicleColor || null,
    shipmentId: body.shipmentId || null,
    chassis: body.chassis || null,
    make: body.make || null,
    toLocation: body.toLocation || null,
    arrivalDate: body.arrivalDate || null,
    arrivalTime: body.arrivalTime || null,
    vehicleDetails: body.vehicleDetails || null,
    departureDate: body.departureDate || null,
    departureTime: body.departureTime || null,
    requestedBy: body.requestedBy || null,
    outReason: body.outReason || null,
    transportMode: body.transportMode || null,
    companyName: body.companyName || null,
    carrierName: body.carrierName || null,
    carrierRegNo: body.carrierRegNo || null,
    driverName: body.driverName || null,
    driverNIC: body.driverNIC || null,
    driverContact: body.driverContact || null,
    mileage: body.mileage || null,
    insurance: body.insurance || null,
    garagePlate: body.garagePlate || null,
    comments: body.comments || null,
    passSubType: body.passSubType || null,
    parentPassId: body.parentPassId || null,
    fromLocation: body.fromLocation || null,
    createdById: session.user.id,
    // Auto-approved After Sales sub-passes: set approvedAt so gate_out check works
    ...(isAfterSalesSubPass ? { approvedAt: new Date(), approvedById: session.user.id } : {}),
  };

  // Only include serviceJobNo for After Sales passes (field added via db push, stale client)
  if (body.passType === "AFTER_SALES" && body.serviceJobNo) {
    createData.serviceJobNo = body.serviceJobNo;
  }

  const gatePass = await (prisma.gatePass.create as any)({
    data: createData,
  });

  // If After Sales MAIN_OUT: update status to CASHIER_REVIEW via raw SQL (stale Prisma client doesn't know this enum value)
  if (isAfterSalesMainOut) {
    await prisma.$executeRaw`UPDATE "GatePass" SET status = 'CASHIER_REVIEW'::"GatePassStatus" WHERE id = ${gatePass.id}`;
    gatePass.status = "CASHIER_REVIEW";
  }

  // For CASHIER_REVIEW: notify all CASHIERs
  if (isAfterSalesMainOut) {
    const cashiers = await prisma.user.findMany({ where: { role: "CASHIER" as any } });
    if (cashiers.length > 0) {
      await prisma.notification.createMany({
        data: cashiers.map((c) => ({
          userId: c.id,
          type: "CASHIER_REVIEW_REQUIRED",
          title: "Order Review Required",
          message: `${gatePassNumber} — ${gatePass.vehicle} is ready for order review.`,
          gatePassId: gatePass.id,
        })),
      });
    }
    return NextResponse.json({ gatePass }, { status: 201 });
  }

  // Notify selected approver if provided; otherwise notify all APPROVERs.
  const selectedApproverName = typeof body.approver === "string" ? body.approver.trim() : "";
  let approvers = selectedApproverName
    ? await prisma.user.findMany({
        where: {
          role: "APPROVER",
          name: { equals: selectedApproverName, mode: "insensitive" },
        },
      })
    : await prisma.user.findMany({ where: { role: "APPROVER" } });

  if (selectedApproverName && approvers.length === 0) {
    approvers = await prisma.user.findMany({ where: { role: "APPROVER" } });
  }

  if (approvers.length > 0) {
    await prisma.notification.createMany({
      data: approvers.map((a) => ({
        userId: a.id,
        type: "GATE_PASS_SUBMITTED",
        title: "New Gate Pass Submitted",
        message: `${session.user.name} submitted ${gatePassNumber} for approval.`,
        gatePassId: gatePass.id,
      })),
    });
  }

  try {
    const approversEmail = await prisma.user.findMany({ where: { role: "APPROVER" }, select: { id: true, name: true, email: true } });
    const createdByUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } });
    for (const approver of approversEmail) {
      await sendApprovalRequestEmail(approver.email, approver.name, gatePass.id, {
        gatePassNumber: gatePass.gatePassNumber,
        passType: gatePass.passType,
        passSubType: gatePass.passSubType,
        vehicle: gatePass.vehicle,
        chassis: gatePass.chassis,
        toLocation: gatePass.toLocation,
        fromLocation: gatePass.fromLocation,
        departureDate: gatePass.departureDate,
        departureTime: gatePass.departureTime,
        createdByName: createdByUser?.name || session.user.name || "Unknown",
      });
    }
  } catch (emailErr) {
    console.error("[email] Failed to send approval email:", emailErr);
  }

  return NextResponse.json({ gatePass }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/gate-pass] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
