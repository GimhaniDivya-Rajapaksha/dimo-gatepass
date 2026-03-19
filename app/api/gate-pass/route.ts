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
    // ASO sees their own passes + AFTER_SALES passes destined for their location
    // UNLESS locationView=true (Vehicles Incoming dashboard) or searching by GP number
    const locationView = searchParams.get("locationView") === "true";
    const isAfterSalesSearch = searchParams.get("passType") === "AFTER_SALES" && searchParams.get("search");
    if (!locationView && !isAfterSalesSearch) {
      const asoLocation = (session.user as { defaultLocation?: string | null }).defaultLocation;
      const orClauses: unknown[] = [
        { createdById: session.user.id },
        { parentPass: { createdById: session.user.id } },
      ];
      // Also show AFTER_SALES passes heading to / from this ASO's location (e.g. SUB_OUT from Initiator)
      if (asoLocation) {
        orClauses.push({ passType: "AFTER_SALES", toLocation: asoLocation });
        orClauses.push({ passType: "AFTER_SALES", fromLocation: asoLocation });
      }
      where.AND = [{ OR: orClauses }];
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

  // For approver AFTER_SALES queue: include CASHIER_REVIEW passes with credit pending
  if (passType === "AFTER_SALES" && status === "PENDING_APPROVAL") {
    delete (where as any).status;
    const andArr: unknown[] = Array.isArray((where as any).AND) ? (where as any).AND : (where as any).AND ? [(where as any).AND] : [];
    andArr.push({
      OR: [
        { status: "PENDING_APPROVAL" },
        { AND: [{ status: "CASHIER_REVIEW" }, { hasCredit: true }, { creditApproved: false }] },
      ],
    });
    (where as any).AND = andArr;
  }

  // Cashier pending filter: only passes where cashier still has work (cashierCleared = false)
  const cashierPending = searchParams.get("cashierPending") === "true";
  if (cashierPending) {
    (where as any).cashierCleared = false;
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

  try {
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
  } catch (err) {
    console.error("[GET /api/gate-pass] Error:", err);
    return NextResponse.json({ error: String(err), passes: [], total: 0, page: 1, totalPages: 1 }, { status: 500 });
  }
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
    paymentType: null, // Auto-detected from SAP payTerm when cashier processes
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
  // Store invoice flag hint from frontend (server-side will confirm below)
  if (body.passType === "CUSTOMER_DELIVERY" && typeof body.isInvoiced === "boolean") {
    createData.paymentType = body.isInvoiced ? "INVOICED" : "NOT_INVOICED";
  }

  const gatePass = await (prisma.gatePass.create as any)({
    data: createData,
  });

  // CUSTOMER_DELIVERY: auto-fetch SAP orders at creation, store invoice data, set paymentType authoritatively
  if (body.passType === "CUSTOMER_DELIVERY") {
    try {
      const { fetchSapOrders } = await import("@/lib/sap");
      const chassisNo = (createData.chassis as string | null) ?? "";
      const plateNo   = (createData.vehicle as string) ?? "";
      const sapOrders = await fetchSapOrders(chassisNo, plateNo);
      const active = sapOrders.filter((o) => !o.cancelled && o.orderId);

      if (active.length > 0) {
        // Store each order — use payTerm field to store "HSTAT:<code>|<billingType>" for approver display
        await prisma.serviceOrder.createMany({
          data: active.map((o) => ({
            gatePassId: gatePass.id,
            orderId:     o.orderId,
            orderStatus: o.orderStatus || o.orderStatusCode || "—",
            payTerm:     `HSTAT:${o.orderStatusCode}|${o.billingType}|${o.billingDate}`,
            isAssigned:  o.orderStatusCode === "H070",
          })),
        });
        const isInvoiced = active.some((o) => o.orderStatusCode === "H070");
        await prisma.$executeRaw`UPDATE "GatePass" SET "paymentType" = ${isInvoiced ? "INVOICED" : "NOT_INVOICED"} WHERE id = ${gatePass.id}`;
        gatePass.paymentType = isInvoiced ? "INVOICED" : "NOT_INVOICED";
      }
    } catch (err) {
      console.error("[CD] SAP invoice fetch error:", err);
      // Non-fatal — pass is still created; paymentType stays as frontend-provided hint
    }
  }

  // MAIN_OUT: auto-fetch SAP orders at creation, detect payment types, notify CASHIER + APPROVER in parallel
  if (isAfterSalesMainOut) {
    await prisma.$executeRaw`UPDATE "GatePass" SET status = 'CASHIER_REVIEW'::"GatePassStatus" WHERE id = ${gatePass.id}`;
    gatePass.status = "CASHIER_REVIEW";

    // Auto-fetch SAP orders at creation time
    let hasImmediate = false;
    let hasCredit = false;
    try {
      const { fetchSapOrders } = await import("@/lib/sap");
      const chassisNo = (createData.chassis as string | null) ?? "";
      const plateNo = (createData.vehicle as string) ?? "";
      const sapOrders = await fetchSapOrders(chassisNo, plateNo);
      const active = sapOrders.filter((o) => !o.cancelled && o.orderId);
      const immediateTerms = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction"];

      if (active.length > 0) {
        await prisma.serviceOrder.createMany({
          data: active.map((o) => ({
            gatePassId: gatePass.id,
            orderId: o.orderId,
            orderStatus: o.orderStatus || "Open",
            payTerm: o.payTerm || o.payTermCode || "",
            isAssigned: false,
          })),
        });
        hasImmediate = active.some((o) => immediateTerms.includes((o.payTerm || "").toLowerCase().trim()));
        hasCredit = active.some((o) => {
          const t = (o.payTerm || "").toLowerCase().trim();
          return t !== "" && !immediateTerms.includes(t);
        });
      }
    } catch (sapErr) {
      console.error("[MAIN_OUT creation] SAP fetch failed:", sapErr);
      // Continue without orders — cashier can sync manually
    }

    // Set flags. If one track has nothing to do, pre-mark it as done.
    const cashierCleared = !hasImmediate; // no immediate orders = cashier has nothing to do
    const creditApproved = !hasCredit;   // no credit orders = approver has nothing to do
    const detectedPaymentType = hasCredit && hasImmediate ? "MIXED" : hasCredit ? "CREDIT" : "CASH";

    await prisma.$executeRaw`UPDATE "GatePass" SET
      "hasImmediate" = ${hasImmediate},
      "hasCredit" = ${hasCredit},
      "cashierCleared" = ${cashierCleared},
      "creditApproved" = ${creditApproved},
      "paymentType" = ${detectedPaymentType}
      WHERE id = ${gatePass.id}`;

    // Notify Cashier if has immediate orders (or no orders at all — cashier to verify)
    if (hasImmediate || (!hasImmediate && !hasCredit)) {
      const cashiers = await prisma.user.findMany({ where: { role: "CASHIER" as any } });
      if (cashiers.length > 0) {
        await prisma.notification.createMany({
          data: cashiers.map((c) => ({
            userId: c.id,
            type: "CASHIER_REVIEW_REQUIRED",
            title: "Order Review Required",
            message: `${gatePassNumber} — ${gatePass.vehicle} has immediate payment orders to clear.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    // Notify Approver if has credit orders (IN PARALLEL with cashier)
    if (hasCredit) {
      const approvers = await prisma.user.findMany({ where: { role: "APPROVER" } });
      if (approvers.length > 0) {
        await prisma.notification.createMany({
          data: approvers.map((a) => ({
            userId: a.id,
            type: "GATE_PASS_SUBMITTED",
            title: "Credit Payment — Approval Required",
            message: `${gatePassNumber} (${gatePass.vehicle}) — credit payment orders detected. Your approval is needed in parallel with cashier review.`,
            gatePassId: gatePass.id,
          })),
        });
      }
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
