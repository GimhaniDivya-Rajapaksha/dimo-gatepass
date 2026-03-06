import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  if (role === "INITIATOR") where.createdById = session.user.id;
  else if (role === "RECIPIENT") where.status = { in: ["GATE_OUT", "COMPLETED"] };
  // APPROVER and ADMIN see all

  if (passType) where.passType = passType;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { gatePassNumber: { contains: search, mode: "insensitive" } },
      { vehicle: { contains: search, mode: "insensitive" } },
      { chassis: { contains: search, mode: "insensitive" } },
      { requestedBy: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, passes] = await Promise.all([
    prisma.gatePass.count({ where }),
    prisma.gatePass.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return NextResponse.json({ passes, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "INITIATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();

  const count = await prisma.gatePass.count();
  const gatePassNumber = `GP-${String(count + 1).padStart(4, "0")}`;

  const gatePass = await prisma.gatePass.create({
    data: {
      gatePassNumber,
      passType: body.passType,
      status: "PENDING_APPROVAL",
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
      createdById: session.user.id,
    },
  });

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

  return NextResponse.json({ gatePass }, { status: 201 });
}
