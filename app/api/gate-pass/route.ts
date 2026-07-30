import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendApprovalRequestEmail, sendRequestedByNotificationEmail, sendTestDriveReturnTimeExceededEmail } from "@/lib/email";
import { findApproversForLocationBrand } from "@/lib/approver-routing";
import { isApproverRole } from "@/lib/roles";
import { getUserPlantPrefixes, plantsWhereOr, findExtraMappedUserIds } from "@/lib/user-plants";

function ciEquals(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? { equals: normalized, mode: "insensitive" as const } : undefined;
}

function plantPrefix(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.split(" - ")[0].trim() : "";
}

function ciStartsWithPlant(value: string | null | undefined) {
  const plant = plantPrefix(value);
  return plant ? { startsWith: plant, mode: "insensitive" as const } : undefined;
}

function withJourneyNumber<T extends { passType?: string | null; gatePassNumber: string; parentPass?: { gatePassNumber: string } | null }>(pass: T): T {
  if (pass.passType === "AFTER_SALES" && pass.parentPass?.gatePassNumber) {
    return { ...pass, gatePassNumber: pass.parentPass.gatePassNumber };
  }
  return pass;
}

async function sendApprovalEmailsToApprovers(approvers: { id: string; email: string; name: string }[], gatePass: any, createdByName: string) {
  try {
    for (const approver of approvers) {
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
        createdByName,
      }, approver.id);
    }
  } catch (emailErr) {
    console.error("[email] Failed to send approval email:", emailErr);
  }
}

// Returns cashiers at the vehicle's location (including anyone additionally mapped to it
// via UserPlantMapping); falls back to all cashiers if none assigned there.
async function getCashiersForLocation(fromLocation: string | null) {
  const plantPrefix = fromLocation ? fromLocation.split(" - ")[0].trim() : null;
  if (plantPrefix) {
    const extraIds = await findExtraMappedUserIds("CASHIER", plantPrefix);
    const located = await prisma.user.findMany({
      where: {
        role: "CASHIER" as any,
        OR: [
          { defaultLocation: { startsWith: plantPrefix, mode: "insensitive" as const } },
          ...(extraIds.length > 0 ? [{ id: { in: extraIds } }] : []),
        ],
      },
    });
    if (located.length > 0) return located;
  }
  return prisma.user.findMany({ where: { role: "CASHIER" as any } });
}

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
  const locationView = searchParams.get("locationView") === "true";

  if (role === "INITIATOR" || role === "SERVICE_ADVISOR") {
    if (status === "DRAFT") {
      // Security-created drafts: only show to the role at the SAME location(s) as the Security
      // Officer. Filter by matching the creator's defaultLocation plant prefix against any of
      // this user's mapped plants — more reliable than fromLocation/toLocation which can be
      // null on older passes.
      const myPlants = await getUserPlantPrefixes(session.user.id);
      where.AND = [
        { status: "DRAFT" },
        { comments: { contains: `[[ASSIGNED_ROLE:${role}]]` } },
        myPlants.length > 0
          ? { OR: myPlants.map((p) => ({ createdBy: { defaultLocation: { startsWith: p } } })) }
          : {},
      ];
    } else if (role === "INITIATOR" && !locationView && !(passType === "AFTER_SALES" && search)) {
      // INITIATOR sees own passes AND sub-passes linked to their main passes
      // Exception: bypass when searching After Sales by GP number (e.g. "Find Gate IN Pass" on create screen)
      // so passes created by Service Advisors or Security Officers are findable.
      const myPlants = await getUserPlantPrefixes(session.user.id);
      const orClauses: unknown[] = [
        { createdById: session.user.id },
        { parentPass: { createdById: session.user.id } },
      ];
      // Security-created passes (any non-DRAFT status) from Security Officers at any of this
      // initiator's mapped locations should be visible to the Initiator who completed them,
      // showing real status.
      for (const plant of myPlants) {
        orClauses.push({
          securityCreated: true,
          status: { not: "DRAFT" },
          createdBy: { defaultLocation: { startsWith: plant } },
        });
      }
      // Also show incoming After Sales SUB_OUT passes that have already been confirmed at any
      // of this initiator's mapped locations, so the destination team can track the received
      // vehicle in "My Gate Passes".
      for (const plant of myPlants) {
        orClauses.push({
          passType: "AFTER_SALES",
          passSubType: "SUB_OUT",
          toLocation: { startsWith: plant, mode: "insensitive" as const },
          status: "COMPLETED",
        });
      }
      where.AND = [{
        OR: orClauses,
      }];
    }
    // SERVICE_ADVISOR (non-DRAFT): sees all passes (fall through)
  } else if (role === "AREA_SALES_OFFICER") {
    // ASO sees their own passes + AFTER_SALES passes destined for their location
    // UNLESS locationView=true (Vehicles Incoming dashboard) or searching by GP number
    const isAfterSalesSearch = searchParams.get("passType") === "AFTER_SALES" && searchParams.get("search");
    if (!locationView && !isAfterSalesSearch) {
      const asoPlants = await getUserPlantPrefixes(session.user.id);
      const orClauses: unknown[] = [
        { createdById: session.user.id },
        { parentPass: { createdById: session.user.id } },
      ];
      // Promo/Finance are sub-locations under the same plant, so match by
      // plant prefix instead of the exact storage-location text — across every
      // plant this ASO is mapped to, not just their primary one.
      for (const plant of asoPlants) {
        const plantLocation = { startsWith: plant, mode: "insensitive" as const };
        orClauses.push({ passType: "AFTER_SALES", toLocation: plantLocation });
        orClauses.push({ passType: "AFTER_SALES", fromLocation: plantLocation });
        // COMPLETED LT passes where ASO confirmed arrival — show in My Gate Passes & Completed.
        // status: "COMPLETED" inside the OR clause is safe: Prisma ANDs it with any outer
        // status filter, so it cannot bleed into PENDING_APPROVAL or GATE_OUT lists.
        orClauses.push({ passType: "LOCATION_TRANSFER", toLocation: plantLocation, status: "COMPLETED" });
        // LT passes transferred OUT of ASO's plant — show in all statuses (PENDING_APPROVAL, APPROVED, GATE_OUT, COMPLETED)
        orClauses.push({ passType: "LOCATION_TRANSFER", fromLocation: plantLocation });
      }
      where.AND = [{ OR: orClauses }];
    }
  } else if (role === "SECURITY_OFFICER") {
    if (status === "DRAFT") {
      // Security-created drafts should only be visible to the same officer
      // who created them, otherwise the dashboard pulls every draft in the system.
      where.AND = [
        { status: "DRAFT" },
        { createdById: session.user.id },
      ];
    }
  } else if (role === "DELIVERY_COORDINATOR") {
    // DC sees all passes at any of their mapped plants (either departing from or arriving to)
    const dcPlants = await getUserPlantPrefixes(session.user.id);
    if (dcPlants.length > 0) {
      where.AND = [{
        OR: [...plantsWhereOr("fromLocation", dcPlants), ...plantsWhereOr("toLocation", dcPlants)],
      }];
    }
  } else if (role === "CASHIER") {
    // Cashier only sees passes originating from any of their mapped plant locations
    const cashierPlants = await getUserPlantPrefixes(session.user.id);
    if (cashierPlants.length > 0) {
      where.AND = [{ OR: plantsWhereOr("fromLocation", cashierPlants) }];
    }
  }
  // APPROVER: for PENDING_APPROVAL passes, only show ones explicitly assigned to them
  // (intendedApprover = their name). For null intendedApprover (old passes), still show all.
  // For other statuses (approved/rejected history), no restriction.
  if (isApproverRole(role) && (!status || status === "PENDING_APPROVAL")) {
    const approverName = (session.user as { name?: string | null }).name ?? "";
    if (approverName) {
      const pendingFilter = { status: "PENDING_APPROVAL" as const };
      const assignedFilter = {
        AND: [
          pendingFilter,
          { OR: [
            { intendedApprover: { equals: approverName, mode: "insensitive" as const } },
            { intendedApprover: null },
          ]},
        ],
      };
      const nonPendingFilter = { status: { not: "PENDING_APPROVAL" as const } };
      if (!where.OR) {
        where.OR = [assignedFilter as object, nonPendingFilter as object];
      }
    }
  }
  // ADMIN sees all

  // toLocation / fromLocation filters (used by Security page and Vehicle Arrivals to scope by gate location)
  // locationPlant   = startsWith match on the plant description (typo-sensitive)
  // locationCode    = contains match on the storage-description code after " - " (typo-immune, preferred)
  const toLocationFilter = searchParams.get("toLocation");
  const toLocationPlant  = searchParams.get("toLocationPlant");
  const toLocationCode   = searchParams.get("toLocationCode");
  if (toLocationCode)       where.toLocation = { contains: toLocationCode,   mode: "insensitive" };
  else if (toLocationPlant) where.toLocation = { startsWith: toLocationPlant, mode: "insensitive" };
  else if (toLocationFilter) where.toLocation = ciEquals(toLocationFilter);

  // Vehicle Arrivals (locationView=true, Initiator/ASO only): never trust the client-supplied
  // toLocationPlant/toLocationCode/toLocation above for who this user is — the frontend used to
  // compute it from the user's own single defaultLocation and send it unvalidated. Resolve the
  // caller's actual mapped plants server-side instead and use that as the real restriction.
  // A client-requested single-plant filter (the "All Mapped Plants / one plant" dropdown) is
  // honored ONLY if it's actually one of this user's own mapped plants — never an arbitrary value.
  // Uses where.AND (not where.OR) so it can't be clobbered by the `search` param handling below,
  // which also assigns where.OR.
  if (locationView && (role === "INITIATOR" || role === "AREA_SALES_OFFICER")) {
    const myArrivalPlants = await getUserPlantPrefixes(session.user.id);
    const requestedPlant = searchParams.get("myPlantFilter");
    const effectivePlants = requestedPlant && myArrivalPlants.includes(requestedPlant)
      ? [requestedPlant]
      : myArrivalPlants;
    delete where.toLocation;
    const existingAnd = Array.isArray((where as any).AND) ? (where as any).AND : (where as any).AND ? [(where as any).AND] : [];
    (where as any).AND = [
      ...existingAnd,
      effectivePlants.length > 0
        ? { OR: plantsWhereOr("toLocation", effectivePlants) }
        // No plant mapped at all — show nothing rather than falling back to "everything".
        : { toLocation: "__no_plant_mapped__" },
    ];
  }

  const fromLocationFilter = searchParams.get("fromLocation");
  const fromLocationPlant  = searchParams.get("fromLocationPlant");
  const fromLocationCode   = searchParams.get("fromLocationCode");
  if (fromLocationCode)       where.fromLocation = { contains: fromLocationCode,   mode: "insensitive" };
  else if (fromLocationPlant) where.fromLocation = { startsWith: fromLocationPlant, mode: "insensitive" };
  else if (fromLocationFilter) where.fromLocation = ciEquals(fromLocationFilter);

  // Security Officer queue: same server-authoritative fix as Vehicle Arrivals above — never
  // trust the client-supplied fromLocationPlant for who this user is; resolve their actual
  // mapped plants server-side instead.
  if (role === "SECURITY_OFFICER") {
    const mySecPlants = await getUserPlantPrefixes(session.user.id);
    delete where.fromLocation;
    const existingAndSec = Array.isArray((where as any).AND) ? (where as any).AND : (where as any).AND ? [(where as any).AND] : [];
    (where as any).AND = [
      ...existingAndSec,
      mySecPlants.length > 0
        ? { OR: plantsWhereOr("fromLocation", mySecPlants) }
        // No plant mapped at all — show nothing rather than falling back to "everything".
        : { fromLocation: "__no_plant_mapped__" },
    ];
  }

  if (passType) where.passType = passType;

  const parentOnly = searchParams.get("parentOnly") === "true";
  if (passType === "AFTER_SALES" && parentOnly) {
    where.parentPassId = null;
  } else if (!passType && role !== "INITIATOR" && role !== "AREA_SALES_OFFICER" && !status) {
    // In "All" view (no specific status filter), hide AFTER_SALES sub-passes to reduce clutter.
    // Exempt INITIATOR and ASO — both need to see sub-passes in their own lists.
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

  // Approver queue: when querying PENDING_APPROVAL, also surface CASHIER_REVIEW passes
  // that have a pending credit component (mixed payment). Applies to all pass types so
  // that CUSTOMER_DELIVERY mixed-payment passes are visible alongside After Sales ones.
  if (isApproverRole(role) && status === "PENDING_APPROVAL") {
    delete (where as any).status;
    const approverName = (session.user as { name?: string | null }).name ?? "";
    const approverMatchFilter = approverName
      ? [{ OR: [
          { intendedApprover: { equals: approverName, mode: "insensitive" as const } },
          { intendedApprover: null },
        ]}]
      : [];
    const andArr: unknown[] = Array.isArray((where as any).AND) ? (where as any).AND : (where as any).AND ? [(where as any).AND] : [];
    andArr.push({
      OR: [
        { status: "PENDING_APPROVAL" },
        { AND: [{ status: "CASHIER_REVIEW" }, { hasCredit: true }, { creditApproved: false }, { creditRejected: false }, ...approverMatchFilter] },
      ],
    });
    (where as any).AND = andArr;
  }

  // Cashier filters
  const cashierPending = searchParams.get("cashierPending") === "true";
  if (cashierPending) (where as any).cashierCleared = false;
  const cashierClearedParam = searchParams.get("cashierCleared");
  if (cashierClearedParam === "true")  (where as any).cashierCleared = true;
  if (cashierClearedParam === "false") (where as any).cashierCleared = false;
  const cashierOverride = searchParams.get("cashierOverride") === "true";
  if (cashierOverride) {
    (where as any).AND = [
      ...((where as any).AND ?? []),
      { OR: [{ cashierOverrideRequested: true }, { singleOrderEscalated: true }] },
    ];
  }

  if (search) {
    where.OR = [
      { gatePassNumber: { contains: search, mode: "insensitive" } },
      { parentPass: { gatePassNumber: { contains: search, mode: "insensitive" } } },
      { vehicle: { contains: search, mode: "insensitive" } },
      { chassis: { contains: search, mode: "insensitive" } },
      { requestedBy: { contains: search, mode: "insensitive" } },
    ];
  }

  const passSubType = searchParams.get("passSubType");
  if (passSubType) where.passSubType = passSubType;

  const updatedAfter = searchParams.get("updatedAfter");
  if (updatedAfter) {
    (where as any).updatedAt = { gte: new Date(updatedAfter) };
  }

  // Test Drive has no Approver workflow at all — Approvers must never see Test Drive
  // passes in any list (pending queue, approved history, or "All" tab), regardless of status.
  if (isApproverRole(role)) {
    const existingAnd = Array.isArray((where as any).AND) ? (where as any).AND : (where as any).AND ? [(where as any).AND] : [];
    (where as any).AND = [...existingAnd, { passType: { not: "TEST_DRIVE" } }];
  }

  try {
    // Run these sequentially to avoid exhausting tiny pooled connection limits
    // during dev and high-concurrency dashboard loads.
    const total = await prisma.gatePass.count({ where: where as any });
    const passes = await prisma.gatePass.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
        parentPass: { select: { id: true, gatePassNumber: true, passSubType: true, status: true, vehicle: true } },
        ...(passType === "AFTER_SALES" && parentOnly
          ? {
              subPasses: {
                select: {
                  id: true,
                  gatePassNumber: true,
                  passSubType: true,
                  status: true,
                  toLocation: true,
                  fromLocation: true,
                  createdAt: true,
                  departureDate: true,
                },
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    } as any);
    return NextResponse.json({
      passes: passes.map((pass) => withJourneyNumber(pass)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[GET /api/gate-pass] Error:", err);
    return NextResponse.json({ error: String(err), passes: [], total: 0, page: 1, totalPages: 1 }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  const allowedRoles = ["INITIATOR", "AREA_SALES_OFFICER", "SERVICE_ADVISOR", "CASHIER", "APPROVER"];
  if (!session || !allowedRoles.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();

  if (session.user.role === "AREA_SALES_OFFICER") {
    if (body.passType === "LOCATION_TRANSFER") {
      if (!body.approver) {
        return NextResponse.json({ error: "Approver is required for ASO location transfers" }, { status: 400 });
      }
    } else if (body.passType === "AFTER_SALES") {
      if (!["SUB_IN", "SUB_OUT", "SUB_OUT_IN", "MAIN_OUT"].includes(body.passSubType)) {
        return NextResponse.json({ error: "Area Sales Officer can only create After Sales sub-passes" }, { status: 403 });
      }
    } else if (body.passType !== "TEST_DRIVE") {
      // Test Drive has no approver workflow for anyone (see isTestDrive below) — ASO can
      // create it exactly like an Initiator does, no extra checks needed.
      return NextResponse.json({ error: "Unauthorized pass type for ASO" }, { status: 403 });
    }
  }

  // Carrier mode: the driver must already exist in Driver Master Data and be mapped to the
  // selected carrier — free-typed driver details are never accepted here. Enforced server-side
  // so the UI's dropdown-only picker can never be bypassed by calling this API directly.
  // Test Drive is unaffected — its own transportMode is always "DRIVER"/"CUSTOMER", never "CARRIER".
  if (body.transportMode === "CARRIER") {
    const carrierRegNo = typeof body.carrierRegNo === "string" ? body.carrierRegNo.trim() : "";
    const driverNIC = typeof body.driverNIC === "string" ? body.driverNIC.trim() : "";
    const invalidDriverError = "Please select a valid driver mapped to the selected carrier. Manually entered driver details are not allowed.";
    if (!carrierRegNo || !driverNIC) {
      return NextResponse.json({ error: invalidDriverError }, { status: 400 });
    }
    const carrier = await prisma.carrierOption.findFirst({ where: { registrationNo: { equals: carrierRegNo, mode: "insensitive" } } });
    const driver = carrier ? await (prisma.driverOption as any).findFirst({ where: { nic: { equals: driverNIC, mode: "insensitive" } } }) : null;
    if (!carrier || !driver || driver.carrierId !== carrier.id) {
      return NextResponse.json({ error: invalidDriverError }, { status: 400 });
    }
    // Authoritative values from Master Data — never trust client-sent name/contact.
    body.driverName = driver.name;
    body.driverNIC = driver.nic;
    body.driverContact = driver.contact ?? body.driverContact ?? null;
  }

  // LT Return Gate Pass leg only (identified by returnPassLocked, set only by that flow):
  // its own Expected Arrival Date & Time must be strictly later than its own Estimated
  // Departure Date & Time, AND that Estimated Departure must itself be strictly later than
  // the first/outbound journey's own Expected Arrival (same date is fine, time must be later).
  // Does not affect the original/outbound LT leg's own fields or validation.
  if (body.passType === "LOCATION_TRANSFER" && body.returnPassLocked === true) {
    if (body.departureDate && body.departureTime && body.arrivalDate && body.arrivalTime) {
      const departureDT = new Date(`${body.departureDate}T${body.departureTime}:00`);
      const arrivalDT = new Date(`${body.arrivalDate}T${body.arrivalTime}:00`);
      if (!Number.isNaN(departureDT.getTime()) && !Number.isNaN(arrivalDT.getTime()) && arrivalDT.getTime() <= departureDT.getTime()) {
        return NextResponse.json({ error: "Return journey expected arrival must be after the return journey departure." }, { status: 400 });
      }
    }
    if (body.parentPassId && body.departureDate && body.departureTime) {
      const parentPass = await prisma.gatePass.findUnique({
        where: { id: body.parentPassId as string },
        select: { arrivalDate: true, arrivalTime: true },
      });
      if (parentPass?.arrivalDate && parentPass.arrivalTime) {
        const firstArrivalDT = new Date(`${parentPass.arrivalDate}T${parentPass.arrivalTime}:00`);
        const returnDepartureDT = new Date(`${body.departureDate}T${body.departureTime}:00`);
        if (!Number.isNaN(firstArrivalDT.getTime()) && !Number.isNaN(returnDepartureDT.getTime()) &&
            returnDepartureDT.getTime() <= firstArrivalDT.getTime()) {
          return NextResponse.json({ error: "Return journey departure must be after the first journey's expected arrival." }, { status: 400 });
        }
      }
    }
  }

  // Block duplicate active gate passes for the same chassis within the same pass type.
  // LT and CD are independent workflows — an active LT does not block a new CD and vice versa.
  // Sub-passes (parentPassId set) are part of an existing journey — skip the check for those.
  if (body.chassis && !body.parentPassId) {
    const activeStatuses = ["PENDING_APPROVAL", "APPROVED", "GATE_OUT", "INITIATOR_OUT", "INITIATOR_IN", "CASHIER_REVIEW", "DRAFT"];
    const existing = await (prisma.gatePass as any).findFirst({
      where: {
        chassis:  { equals: body.chassis.trim(), mode: "insensitive" },
        passType: body.passType,
        status:   { in: activeStatuses },
      },
      select: { gatePassNumber: true, status: true },
    });
    if (existing) {
      return NextResponse.json({
        error: `An active ${(body.passType as string).replace(/_/g, " ")} gate pass (${existing.gatePassNumber}) already exists for this chassis. Complete or cancel it before creating a new one.`,
      }, { status: 409 });
    }
  }

  // After Sales status routing:
  // - MAIN_OUT → CASHIER_REVIEW (cashier checks orders; partial → PENDING_APPROVAL for approver)
  // - MAIN_IN / SUB_IN / SUB_OUT / SUB_OUT_IN → APPROVED directly (no approver needed for these sub-passes)
  // - All other pass types → PENDING_APPROVAL (normal approval flow)
  const isAfterSalesMainOut = body.passType === "AFTER_SALES" && body.passSubType === "MAIN_OUT";
  const isAfterSalesSubPass = body.passType === "AFTER_SALES" && ["MAIN_IN", "SUB_IN", "SUB_OUT", "SUB_OUT_IN"].includes(body.passSubType);
  // Test Drive: no approval workflow at all — goes straight to Security Gate Out, same as an already-approved pass.
  const isTestDrive = body.passType === "TEST_DRIVE";

  // Test Drive's own Driver/Customer fields are plain free-text inputs on the create form —
  // enforce the same NIC/licence/phone format rules server-side so they can't be bypassed.
  if (isTestDrive) {
    const validNIC = (v: string) => /^[0-9]{9}[VvXx]$/.test(v.trim()) || /^[0-9]{12}$/.test(v.trim());
    const validLicenceNo = (v: string) => /^[A-Za-z][0-9]{7}$/.test(v.trim());
    const validPhone = (v: string) => /^[0-9+\-\s]{7,15}$/.test(v.trim());
    if (body.transportMode === "DRIVER") {
      const driverNIC = typeof body.driverNIC === "string" ? body.driverNIC.trim() : "";
      if (!driverNIC || (!validNIC(driverNIC) && !validLicenceNo(driverNIC))) {
        return NextResponse.json({ error: "Invalid Driving Licence No. / NIC format for the Test Drive driver (e.g. 123456789V or B1234567)." }, { status: 400 });
      }
      if (body.driverContact && !validPhone(body.driverContact)) {
        return NextResponse.json({ error: "Invalid driver contact number format." }, { status: 400 });
      }
    } else if (body.transportMode === "CUSTOMER") {
      const customerNIC = typeof body.customerNIC === "string" ? body.customerNIC.trim() : "";
      if (!customerNIC || !validNIC(customerNIC)) {
        return NextResponse.json({ error: "Invalid Customer NIC format (e.g. 123456789V or 200012345678)." }, { status: 400 });
      }
      if (!body.customerContact || !validPhone(body.customerContact)) {
        return NextResponse.json({ error: "Invalid customer contact number format." }, { status: 400 });
      }
    }
    // Return Date & Time must always be strictly later than Gate Out Date & Time.
    if (body.departureDate && body.departureTime && body.returnDate && body.returnTime) {
      const departureDT = new Date(`${body.departureDate}T${body.departureTime}:00`);
      const returnDT = new Date(`${body.returnDate}T${body.returnTime}:00`);
      if (!Number.isNaN(departureDT.getTime()) && !Number.isNaN(returnDT.getTime()) && returnDT.getTime() <= departureDT.getTime()) {
        return NextResponse.json({ error: "Return Date & Time must be later than the Gate Out Date & Time." }, { status: 400 });
      }
    }
  }

  // Use max existing number (not count) to avoid collisions after deletions
  const lastPass = await prisma.gatePass.findFirst({ orderBy: { gatePassNumber: "desc" } });
  const lastNum = lastPass ? parseInt(lastPass.gatePassNumber.replace(/^GP-/, ""), 10) || 0 : 0;
  const gatePassNumber = `GP-${String(lastNum + 1).padStart(4, "0")}`;

  const initialStatus = (isAfterSalesSubPass || isTestDrive) ? "APPROVED" : "PENDING_APPROVAL";

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
    toPlantCode: body.toPlantCode || null,
    toStorageLocation: body.toStorageLocation || null,
    arrivalDate: body.arrivalDate || null,
    arrivalTime: body.arrivalTime || null,
    vehicleDetails: body.vehicleDetails || null,
    departureDate: body.departureDate || null,
    departureTime: body.departureTime || null,
    requestedBy: body.requestedBy || null,
    requestedByEmail: body.requestedByEmail || null,
    intendedApprover: (typeof body.approver === "string" ? body.approver.trim() : null) || null,
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
    remarks: body.remarks || null,
    comments: body.comments || null,
    passSubType: body.passSubType || null,
    paymentType: null, // Auto-detected from SAP payTerm when cashier processes
    parentPassId: body.parentPassId || null,
    returnPassLocked: body.returnPassLocked || false,
    fromLocation: body.fromLocation || null,
    fromPlantCode: body.fromPlantCode || null,
    fromStorageLocation: body.fromStorageLocation || null,
    sapVehicleId: body.sapVehicleId || null,
    asoCreated: session.user.role === "AREA_SALES_OFFICER" && body.passType === "LOCATION_TRANSFER",
    createdById: session.user.id,
    // Auto-approved After Sales sub-passes / Test Drive: set approvedAt so gate_out check works
    ...((isAfterSalesSubPass || isTestDrive) ? { approvedAt: new Date(), approvedById: session.user.id } : {}),
    // Test Drive only — no other pass type sends these
    ...(isTestDrive ? {
      returnDate: body.returnDate || null,
      returnTime: body.returnTime || null,
      customerName: body.customerName || null,
      customerNIC: body.customerNIC || null,
      customerContact: body.customerContact || null,
    } : {}),
  };

  // Only include serviceJobNo for After Sales passes (field added via db push, stale client)
  if (body.passType === "AFTER_SALES" && body.serviceJobNo) {
    createData.serviceJobNo = body.serviceJobNo;
  }

  const gatePass = await (prisma.gatePass.create as any)({
    data: createData,
  });

  // Notify the "Requested By" person (if selected from AD and email is known)
  if (createData.requestedByEmail && createData.requestedBy) {
    sendRequestedByNotificationEmail(
      createData.requestedByEmail as string,
      createData.requestedBy as string,
      {
        gatePassNumber: gatePass.gatePassNumber,
        passId: gatePass.id,
        passType: gatePass.passType,
        vehicle: gatePass.vehicle,
        chassis: gatePass.chassis,
        toLocation: gatePass.toLocation,
        fromLocation: gatePass.fromLocation,
        departureDate: gatePass.departureDate,
        departureTime: gatePass.departureTime,
        createdByName: session.user.name || "Unknown",
        onBehalf: (createData.requestedByEmail as string) !== session.user.email,
      }
    ).catch((e: unknown) => console.error("[email] requestedBy notification failed:", e));
  }

  // Test Drive: Return Time selected beyond the 1-hour cap is allowed (not blocked),
  // but the Initiator and their Reporting Manager get notified in-app + by email.
  if (isTestDrive && body.returnTimeExceeded) {
    try {
      const initiator = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, approver: { select: { id: true, name: true, email: true } } },
      });
      const recipients = [initiator, initiator?.approver].filter(
        (u): u is { id: string; name: string; email: string } => !!u
      );
      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((u) => ({
            userId: u.id,
            type: "TEST_DRIVE_RETURN_TIME_EXCEEDED",
            title: "Test Drive Return Time Exceeds 1 Hour",
            message: `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) has a scheduled Return Time beyond the 1-hour Test Drive limit.`,
            gatePassId: gatePass.id,
          })),
        });
      }
      for (const u of recipients) {
        sendTestDriveReturnTimeExceededEmail(u.email, u.name, {
          gatePassNumber: gatePass.gatePassNumber,
          passId: gatePass.id,
          vehicle: gatePass.vehicle,
          departureDate: gatePass.departureDate,
          departureTime: gatePass.departureTime,
          returnTime: gatePass.returnTime,
        }).catch((e: unknown) => console.error("[email] Test Drive return-time-exceeded notification failed:", e));
      }
    } catch (e) {
      console.error("[TEST_DRIVE] return-time-exceeded notification failed:", e);
    }
  }

  // CUSTOMER_DELIVERY: no Approver, no Cashier — every CD pass is auto-approved immediately
  // and goes straight to Security (or the Initiator's own print) for Gate Out, regardless of
  // happy path / unhappy path / immediate / credit. SAP order data (ServiceOrder rows,
  // hasCredit/hasImmediate/paymentType) is still fetched and stored for record-keeping and
  // later reconciliation — it just no longer decides the pass's status or who reviews it.
  if (body.passType === "CUSTOMER_DELIVERY") {
    const approverLocation = (createData.fromLocation as string | null) ?? null;

    await prisma.gatePass.update({
      where: { id: gatePass.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: session.user.id },
    });
    gatePass.status = "APPROVED";

    try {
      const { fetchSapOrders } = await import("@/lib/sap");
      const chassisNo = (createData.chassis as string | null) ?? "";
      const plateNo   = (createData.vehicle as string) ?? "";
      const sapOrders = await fetchSapOrders(chassisNo, plateNo);
      const active = sapOrders.filter((o) => !o.cancelled && o.orderId);

      if (active.length > 0) {
        await prisma.serviceOrder.createMany({
          data: active.map((o) => ({
            gatePassId:      gatePass.id,
            orderId:         o.orderId,
            orderStatus:     o.orderStatus || o.orderStatusCode || "—",
            orderStatusCode: o.orderStatusCode,
            billingType:     o.billingType,
            payTermCode:     o.payTermCode,
            payTerm:         o.payTerm,
            cancelled:       o.cancelled,
            isHappyPath:     o.isHappyPath,
            isAssigned:      false,
          })),
        });

        // Payment type label recorded for reporting/reconciliation only — does not affect routing.
        const ztermHasImmediate = active.some((o) => o.payTermCode === "ZC01");
        const ztermHasCredit    = active.some((o) => o.payTermCode !== "ZC01");
        const ztermPaymentType  = ztermHasImmediate && ztermHasCredit ? "MIXED"
                                : ztermHasImmediate ? "IMMEDIATE"
                                : "CREDIT";
        await prisma.gatePass.update({
          where: { id: gatePass.id },
          data: { paymentType: ztermPaymentType, hasImmediate: ztermHasImmediate, hasCredit: ztermHasCredit },
        });
      }
    } catch (err) {
      // Record-keeping only — a SAP lookup failure never blocks or reroutes the pass.
      console.error("[CD] SAP order lookup failed (record-keeping only; pass proceeds to Security):", err);
    }

    const cdExtraSecIds = approverLocation ? await findExtraMappedUserIds("SECURITY_OFFICER", approverLocation) : [];
    const secWhere = approverLocation
      ? { role: "SECURITY_OFFICER" as any, OR: [{ defaultLocation: approverLocation }, ...(cdExtraSecIds.length > 0 ? [{ id: { in: cdExtraSecIds } }] : [])] }
      : { role: "SECURITY_OFFICER" as any };
    const secOfficers = await prisma.user.findMany({ where: secWhere });
    if (secOfficers.length > 0) {
      await prisma.notification.createMany({
        data: secOfficers.map((s: { id: string }) => ({
          userId: s.id,
          type: "GATE_PASS_APPROVED",
          title: "Customer Delivery Approved — Confirm Gate OUT",
          message: `${gatePassNumber} (${gatePass.vehicle}) — customer delivery approved. Please confirm Gate OUT.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    return NextResponse.json({ gatePass }, { status: 201 });
  }

  // MAIN_IN created: notify Security Officers at fromLocation (initiator's DIMO location — vehicle arriving for service)
  if (body.passType === "AFTER_SALES" && body.passSubType === "MAIN_IN") {
    const fromLoc = (createData.fromLocation as string | null) ?? null;
    const mainInExtraSecIds = fromLoc ? await findExtraMappedUserIds("SECURITY_OFFICER", fromLoc) : [];
    const secWhere = fromLoc
      ? { role: "SECURITY_OFFICER" as any, OR: [{ defaultLocation: fromLoc }, ...(mainInExtraSecIds.length > 0 ? [{ id: { in: mainInExtraSecIds } }] : [])] }
      : { role: "SECURITY_OFFICER" as any };
    const secOfficers = await prisma.user.findMany({ where: secWhere });
    if (secOfficers.length > 0) {
      await prisma.notification.createMany({
        data: secOfficers.map((s: { id: string }) => ({
          userId: s.id,
          type: "GATE_PASS_APPROVED",
          title: "Incoming Service Vehicle — Confirm Gate IN",
          message: `${gatePassNumber} (${gatePass.vehicle}) — After Sales Gate IN created. Please confirm vehicle entry at the gate.`,
          gatePassId: gatePass.id,
        })),
      });
    }
    return NextResponse.json({ gatePass }, { status: 201 });
  }

  // SUB_OUT created: notify Security Officers at fromLocation (vehicle leaving DIMO to sub-location)
  if (body.passType === "AFTER_SALES" && body.passSubType === "SUB_OUT") {
    const fromLoc = (createData.fromLocation as string | null) ?? null;
    const subOutExtraSecIds = fromLoc ? await findExtraMappedUserIds("SECURITY_OFFICER", fromLoc) : [];
    const secWhere = fromLoc
      ? { role: "SECURITY_OFFICER" as any, OR: [{ defaultLocation: fromLoc }, ...(subOutExtraSecIds.length > 0 ? [{ id: { in: subOutExtraSecIds } }] : [])] }
      : { role: "SECURITY_OFFICER" as any };
    const secOfficers = await prisma.user.findMany({ where: secWhere });
    if (secOfficers.length > 0) {
      await prisma.notification.createMany({
        data: secOfficers.map((s: { id: string }) => ({
          userId: s.id,
          type: "GATE_PASS_APPROVED",
          title: "Sub OUT Ready — Confirm Gate Release",
          message: `${gatePassNumber} (${gatePass.vehicle}) — Sub OUT pass created. Vehicle ready to depart to ${gatePass.toLocation ?? "sub-location"}. Please confirm Gate OUT.`,
          gatePassId: gatePass.id,
        })),
      });
    }
    return NextResponse.json({ gatePass }, { status: 201 });
  }

  // MAIN_OUT: auto-fetch SAP orders at creation, detect payment types, notify CASHIER + APPROVER in parallel
  if (isAfterSalesMainOut) {
    await prisma.$executeRaw`UPDATE "GatePass" SET status = 'CASHIER_REVIEW'::"GatePassStatus" WHERE id = ${gatePass.id}`;
    gatePass.status = "CASHIER_REVIEW";
    const approverLocation = (createData.fromLocation as string | null) ?? null;
    const selectedApproverName = typeof body.approver === "string" ? body.approver.trim() : "";

    // Auto-fetch SAP orders at creation time
    let hasImmediate = false;
    let hasCredit = false;
    try {
      const { fetchSapOrders } = await import("@/lib/sap");
      const chassisNo = (createData.chassis as string | null) ?? "";
      const plateNo = (createData.vehicle as string) ?? "";
      const sapOrders = await fetchSapOrders(chassisNo, plateNo);
      const active = sapOrders.filter((o) => !o.cancelled && o.orderId);
      const immediateTerms = ["immediate", "zc01", "0001", "payment immediate", "cash", "pay immediately w/o deduction"];

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
        hasImmediate = active.some((o) => immediateTerms.includes((o.payTerm || o.payTermCode || "").toLowerCase().trim()));
        hasCredit = active.some((o) => {
          const t = (o.payTerm || o.payTermCode || "").toLowerCase().trim();
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

    // Immediate-only → cashier. No-orders / credit-only → approver. Mixed → both.
    if (hasImmediate) {
      const cashiers = await getCashiersForLocation(approverLocation);
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

    if (!hasImmediate && hasCredit) {
      await prisma.gatePass.update({
        where: { id: gatePass.id },
        data: { status: "PENDING_APPROVAL" },
      });
      gatePass.status = "PENDING_APPROVAL";
    }

    if (!hasImmediate && !hasCredit) {
      await prisma.gatePass.update({
        where: { id: gatePass.id },
        data: { status: "PENDING_APPROVAL", hasCredit: true, creditApproved: false, paymentType: "CREDIT" },
      });
      gatePass.status = "PENDING_APPROVAL";
      hasCredit = true;
    }

    // Notify Approver if credit-like review is needed (credit or no SAP orders)
    if (hasCredit) {
      const approvers = await findApproversForLocationBrand(approverLocation, selectedApproverName, createData.make as string | null);
      if (approvers.length > 0) {
        await prisma.notification.createMany({
          data: approvers.map((a) => ({
            userId: a.id,
            type: "GATE_PASS_SUBMITTED",
            title: "Credit Payment — Approval Required",
            message: `${gatePassNumber} (${gatePass.vehicle}) — ${hasImmediate ? "credit payment orders detected. Your approval is needed in parallel with cashier review." : "approval is required before release."}`,
            gatePassId: gatePass.id,
          })),
        });
        await sendApprovalEmailsToApprovers(approvers, gatePass, session.user.name || "Unknown");
      }
    }

    return NextResponse.json({ gatePass }, { status: 201 });
  }

  // Notify selected approver if provided; otherwise notify all APPROVERs.
  // Test Drive has no approval workflow at all (see isTestDrive above, which auto-approves
  // it at creation) — it must never notify, email, or otherwise involve any Approver.
  let approvers: { id: string; email: string; name: string }[] = [];
  if (!isTestDrive) {
    const selectedApproverName = typeof body.approver === "string" ? body.approver.trim() : "";
    // An Approver initiating their own gate pass must never route to (or notify) a normal
    // Approver — it goes only to whichever Special Approver they're mapped to.
    const approverRole = session.user.role === "APPROVER" ? "SPECIAL_APPROVER" : "APPROVER";
    approvers = selectedApproverName
      ? await prisma.user.findMany({
          where: {
            role: approverRole as any,
            name: { equals: selectedApproverName, mode: "insensitive" },
          },
        })
      : await prisma.user.findMany({ where: { role: approverRole as any } });

    if (selectedApproverName && approvers.length === 0) {
      approvers = await prisma.user.findMany({ where: { role: approverRole as any } });
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
  }

  // Notify ADMIN users so the dot indicator appears on their dashboard
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "GATE_PASS_SUBMITTED",
        title: "New Gate Pass Submitted",
        message: `${session.user.name} submitted ${gatePassNumber} for approval.`,
        gatePassId: gatePass.id,
      })),
    });
  }

  await sendApprovalEmailsToApprovers(approvers, gatePass, session.user.name || "Unknown");

  // LT: notify ASOs at fromLocation when pass is created by a non-ASO
  if (body.passType === "LOCATION_TRANSFER" && !gatePass.asoCreated && gatePass.fromLocation) {
    const fromAsoFilter = ciStartsWithPlant(gatePass.fromLocation as string);
    if (fromAsoFilter) {
      const ltExtraAsoIds = await findExtraMappedUserIds("AREA_SALES_OFFICER", gatePass.fromLocation as string);
      const fromAsos = await prisma.user.findMany({
        where: {
          role: "AREA_SALES_OFFICER" as any,
          OR: [{ defaultLocation: fromAsoFilter }, ...(ltExtraAsoIds.length > 0 ? [{ id: { in: ltExtraAsoIds } }] : [])],
        },
        select: { id: true },
      });
      if (fromAsos.length > 0) {
        await prisma.notification.createMany({
          data: fromAsos.map((aso: { id: string }) => ({
            userId: aso.id,
            type: "GATE_PASS_SUBMITTED",
            title: "Vehicle Transfer Request from Your Location",
            message: `${gatePassNumber} — ${session.user.name ?? "A user"} submitted a transfer request for ${gatePass.vehicle ?? "a vehicle"} from ${gatePass.fromLocation} to ${gatePass.toLocation ?? "another location"}.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }
  }

  return NextResponse.json({ gatePass }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/gate-pass] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
