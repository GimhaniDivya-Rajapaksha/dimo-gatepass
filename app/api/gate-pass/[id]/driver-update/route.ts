import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendDriverChangedEmail } from "@/lib/email";

// "Change Driver / Carrier" feature — fully isolated from the LT/CD/Test Drive creation,
// approval, and SAP-integration code paths. It only ever touches driverName/driverNIC/
// driverLicenceNo/driverContact/companyName/carrierRegNo, available from Approved through
// Gate Out, and logs every change. Not available while still Pending Approval — that stage
// already has its own edit/resubmit path — and no longer available once Completed, since
// the journey is finished by then. Every other field (vehicle, destination, approver, etc.)
// stays completely untouched by this route.
const IN_SCOPE_PASS_TYPES = ["LOCATION_TRANSFER", "CUSTOMER_DELIVERY", "TEST_DRIVE"];
const INELIGIBLE_STATUSES = ["PENDING_APPROVAL", "CANCELLED", "REJECTED", "DRAFT", "COMPLETED"];

function normalize(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function isValidNIC(v: string) {
  return /^[0-9]{9}[VvXx]$/.test(v.trim()) || /^[0-9]{12}$/.test(v.trim());
}
function isValidLicenceNo(v: string) {
  return /^[A-Za-z][0-9]{7}$/.test(v.trim());
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gatePass = await (prisma.gatePass as any).findUnique({ where: { id } });
  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isCreator = gatePass.createdById === session.user.id;
  // Read access is intentionally broad — this is audit-trail history (who changed what,
  // when), viewed from both the pass detail page and the cross-vehicle Vehicle Report,
  // the latter of which is used by staff who aren't necessarily this pass's creator/approver.
  // Only the PATCH below (the actual edit) stays restricted to the pass's creator.

  const changeLogs = await (prisma as any).gatePassChangeLog.findMany({
    where: { gatePassId: id, changeType: "DRIVER_UPDATE" },
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    driver: {
      driverName: gatePass.driverName,
      driverNIC: gatePass.driverNIC,
      driverLicenceNo: gatePass.driverLicenceNo,
      driverContact: gatePass.driverContact,
      companyName: gatePass.companyName,
      carrierRegNo: gatePass.carrierRegNo,
    },
    canEdit: isCreator && !INELIGIBLE_STATUSES.includes(gatePass.status) && !gatePass.returnPassLocked && IN_SCOPE_PASS_TYPES.includes(gatePass.passType),
    changeLogs: changeLogs.map((c: any) => ({
      id: c.id,
      previousData: c.previousData,
      newData: c.newData,
      reason: c.reason,
      changedByName: c.changedBy?.name ?? "Unknown",
      createdAt: c.createdAt,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const driverNIC = normalize(body.driverNIC);
  const driverName = normalize(body.driverName);
  const driverLicenceNo = normalize(body.driverLicenceNo);
  const companyName = normalize(body.companyName);
  const carrierRegNo = normalize(body.carrierRegNo);
  const reason = normalize(body.reason) || null;

  if (!driverNIC || !driverName || !driverLicenceNo) {
    return NextResponse.json({ error: "Driver name, NIC, and Driving Licence No. are all required." }, { status: 400 });
  }
  if (!isValidNIC(driverNIC)) {
    return NextResponse.json({ error: "Invalid NIC format (e.g. 123456789V or 200012345678)." }, { status: 400 });
  }
  if (!isValidLicenceNo(driverLicenceNo)) {
    return NextResponse.json({ error: "Invalid Driving Licence No. format (e.g. B1234567 — 1 letter followed by 7 digits)." }, { status: 400 });
  }
  if (!companyName || !carrierRegNo) {
    return NextResponse.json({ error: "Carrier Company is required." }, { status: 400 });
  }

  const gatePass = await (prisma.gatePass as any).findUnique({ where: { id } });
  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (gatePass.createdById !== session.user.id) {
    return NextResponse.json({ error: "Only the initiator who created this gate pass can change its driver or carrier." }, { status: 403 });
  }
  if (gatePass.returnPassLocked) {
    return NextResponse.json({ error: "This Return Gate Pass is locked until the original Location Transfer is completed." }, { status: 400 });
  }
  if (!IN_SCOPE_PASS_TYPES.includes(gatePass.passType)) {
    return NextResponse.json({ error: "Driver change is only available for Location Transfer, Customer Delivery, and Test Drive." }, { status: 400 });
  }
  if (INELIGIBLE_STATUSES.includes(gatePass.status)) {
    return NextResponse.json({ error: "The driver can only be changed once the gate pass is Approved." }, { status: 400 });
  }

  // Prefer master-data values (single source of truth) when this NIC/reg no. is known;
  // otherwise fall back to whatever the caller supplied (manual entry not yet saved to master data).
  const masterDriver = await (prisma as any).driverOption.findUnique({ where: { nic: driverNIC } });
  const newDriverName = masterDriver?.name ?? driverName;
  const newDriverLicenceNo = masterDriver?.licenceNo ?? driverLicenceNo;
  const newDriverContact = masterDriver?.contact ?? null;

  const masterCarrier = await prisma.carrierOption.findUnique({ where: { registrationNo: carrierRegNo } });
  const newCompanyName = masterCarrier?.companyName ?? companyName;
  const newCarrierRegNo = carrierRegNo;

  const previousData = {
    driverName: gatePass.driverName,
    driverNIC: gatePass.driverNIC,
    driverLicenceNo: gatePass.driverLicenceNo,
    driverContact: gatePass.driverContact,
    companyName: gatePass.companyName,
    carrierRegNo: gatePass.carrierRegNo,
  };
  const newData = {
    driverName: newDriverName,
    driverNIC: driverNIC,
    driverLicenceNo: newDriverLicenceNo,
    driverContact: newDriverContact,
    companyName: newCompanyName,
    carrierRegNo: newCarrierRegNo,
  };

  const updated = await prisma.gatePass.update({
    where: { id },
    data: {
      driverName: newData.driverName,
      driverNIC: newData.driverNIC,
      driverLicenceNo: newData.driverLicenceNo,
      driverContact: newData.driverContact,
      companyName: newData.companyName,
      carrierRegNo: newData.carrierRegNo,
    } as any,
  });

  await (prisma as any).gatePassChangeLog.create({
    data: {
      gatePassId: id,
      changeType: "DRIVER_UPDATE",
      previousData,
      newData,
      reason,
      changedById: session.user.id,
    },
  });

  // Notify + email the approver about the driver change.
  try {
    let approverUser: { id: string; name: string; email: string } | null = null;
    if (gatePass.approvedById) {
      approverUser = await prisma.user.findUnique({
        where: { id: gatePass.approvedById },
        select: { id: true, name: true, email: true },
      });
    } else if (gatePass.intendedApprover) {
      approverUser = await prisma.user.findFirst({
        where: { name: { equals: gatePass.intendedApprover, mode: "insensitive" } },
        select: { id: true, name: true, email: true },
      });
    }

    if (approverUser) {
      const carrierChanged = previousData.carrierRegNo !== newData.carrierRegNo;
      const changeSummary = carrierChanged
        ? `changed the driver from ${previousData.driverName ?? "—"} to ${newData.driverName}, and the carrier from ${previousData.companyName ?? "—"} to ${newData.companyName}`
        : `changed the driver from ${previousData.driverName ?? "—"} to ${newData.driverName}`;

      await prisma.notification.create({
        data: {
          userId: approverUser.id,
          type: "DRIVER_CHANGED",
          title: carrierChanged ? "Driver / Carrier Changed" : "Driver Changed",
          message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — ${session.user.name ?? "the initiator"} ${changeSummary}.`,
          gatePassId: gatePass.id,
        },
      });

      sendDriverChangedEmail(approverUser.email, approverUser.name, {
        gatePassNumber: gatePass.gatePassNumber,
        passId: gatePass.id,
        vehicle: gatePass.vehicle,
        previousDriverName: previousData.driverName ?? "—",
        previousDriverNIC: previousData.driverNIC ?? "—",
        newDriverName: newData.driverName,
        newDriverNIC: newData.driverNIC,
        previousCompanyName: carrierChanged ? (previousData.companyName ?? "—") : null,
        newCompanyName: carrierChanged ? newData.companyName : null,
        changedByName: session.user.name ?? "the initiator",
        reason,
      }).catch((e) => console.error("[driver-update] approver email failed:", e));
    }
  } catch (e) {
    console.error("[driver-update] notify approver failed:", e);
  }

  return NextResponse.json({ gatePass: updated });
}
