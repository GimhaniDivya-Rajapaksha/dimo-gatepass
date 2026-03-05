import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gatePass = await prisma.gatePass.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ gatePass });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "APPROVER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

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
