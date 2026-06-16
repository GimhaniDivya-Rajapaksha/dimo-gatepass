import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q") ?? "";

  if (type === "carrier") {
    const data = await prisma.carrierOption.findMany({
      where: q ? {
        OR: [
          { companyName: { contains: q, mode: "insensitive" } },
          { registrationNo: { contains: q, mode: "insensitive" } },
        ],
      } : undefined,
      orderBy: { companyName: "asc" },
    });
    return NextResponse.json({ data });
  }

  if (type === "driver") {
    const data = await prisma.driverOption.findMany({
      where: q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { nic: { contains: q, mode: "insensitive" } },
        ],
      } : undefined,
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data });
  }

  if (type === "outReason") {
    const data = await prisma.outReasonOption.findMany({
      where: q ? { value: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { value: "asc" },
    });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { type } = body;

  if (type === "carrier") {
    const { companyName, registrationNo } = body;
    if (!companyName?.trim() || !registrationNo?.trim())
      return NextResponse.json({ error: "Company name and registration number are required" }, { status: 400 });
    try {
      const record = await prisma.carrierOption.create({
        data: { companyName: companyName.trim(), registrationNo: registrationNo.trim() },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Registration number already exists" }, { status: 409 });
    }
  }

  if (type === "driver") {
    const { name, nic, contact } = body;
    if (!name?.trim() || !nic?.trim())
      return NextResponse.json({ error: "Name and NIC are required" }, { status: 400 });
    try {
      const record = await prisma.driverOption.create({
        data: { name: name.trim(), nic: nic.trim(), contact: contact?.trim() || null },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "NIC already exists" }, { status: 409 });
    }
  }

  if (type === "outReason") {
    const { value } = body;
    if (!value?.trim())
      return NextResponse.json({ error: "Out reason is required" }, { status: 400 });
    try {
      const record = await prisma.outReasonOption.create({
        data: { value: value.trim() },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Out reason already exists" }, { status: 409 });
    }
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { type, id } = body;
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  if (type === "carrier") {
    const { companyName, registrationNo } = body;
    if (!companyName?.trim() || !registrationNo?.trim())
      return NextResponse.json({ error: "Company name and registration number are required" }, { status: 400 });
    try {
      const record = await prisma.carrierOption.update({
        where: { id },
        data: { companyName: companyName.trim(), registrationNo: registrationNo.trim() },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Registration number already exists" }, { status: 409 });
    }
  }

  if (type === "driver") {
    const { name, nic, contact } = body;
    if (!name?.trim() || !nic?.trim())
      return NextResponse.json({ error: "Name and NIC are required" }, { status: 400 });
    try {
      const record = await prisma.driverOption.update({
        where: { id },
        data: { name: name.trim(), nic: nic.trim(), contact: contact?.trim() || null },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "NIC already exists" }, { status: 409 });
    }
  }

  if (type === "outReason") {
    const { value } = body;
    if (!value?.trim())
      return NextResponse.json({ error: "Out reason is required" }, { status: 400 });
    try {
      const record = await prisma.outReasonOption.update({
        where: { id },
        data: { value: value.trim() },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Out reason already exists" }, { status: 409 });
    }
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  if (type === "carrier") {
    await prisma.carrierOption.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  if (type === "driver") {
    await prisma.driverOption.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  if (type === "outReason") {
    await prisma.outReasonOption.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
