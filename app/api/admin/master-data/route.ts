import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

// Same format rules already enforced on the Gate Pass creation form's driver fields.
function isValidNIC(v: string) {
  return /^[0-9]{9}[VvXx]$/.test(v.trim()) || /^[0-9]{12}$/.test(v.trim());
}
function isValidPhone(v: string) {
  return /^[0-9+\-\s]{7,15}$/.test(v.trim());
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
    const data = await (prisma.driverOption as any).findMany({
      where: q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { nic: { contains: q, mode: "insensitive" } },
        ],
      } : undefined,
      include: { carrier: { select: { id: true, companyName: true, registrationNo: true } } },
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

  if (type === "brand") {
    try {
      let data = await prisma.brandOption.findMany({
        where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
        orderBy: { name: "asc" },
      });
      // Seed defaults on first use
      if (!q && data.length === 0) {
        await prisma.brandOption.createMany({
          data: [{ name: "Mercedes-Benz" }, { name: "TATA" }, { name: "Jeep" }],
          skipDuplicates: true,
        });
        data = await prisma.brandOption.findMany({ orderBy: { name: "asc" } });
      }
      return NextResponse.json({ data });
    } catch {
      // Table may not exist yet — return defaults so the UI is still usable
      return NextResponse.json({ data: [] });
    }
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
    const { name, nic, licenceNo, contact, carrierId } = body;
    if (!name?.trim() || !nic?.trim() || !licenceNo?.trim())
      return NextResponse.json({ error: "Name, NIC, and Driving Licence No. are required" }, { status: 400 });
    if (!carrierId)
      return NextResponse.json({ error: "A driver must be assigned to a Carrier Company" }, { status: 400 });
    if (!isValidNIC(nic))
      return NextResponse.json({ error: "Invalid NIC format (e.g. 123456789V or 200012345678)" }, { status: 400 });
    if (contact?.trim() && !isValidPhone(contact))
      return NextResponse.json({ error: "Invalid contact number format" }, { status: 400 });
    const [existingByNic, existingByLicence] = await Promise.all([
      (prisma.driverOption as any).findUnique({ where: { nic: nic.trim() } }),
      (prisma.driverOption as any).findUnique({ where: { licenceNo: licenceNo.trim() } }),
    ]);
    if (existingByNic || existingByLicence) {
      return NextResponse.json({
        error: existingByNic
          ? `A driver with NIC ${nic.trim()} already exists (${existingByNic.name})`
          : `A driver with Driving Licence No. ${licenceNo.trim()} already exists (${existingByLicence.name})`,
      }, { status: 409 });
    }
    try {
      const record = await (prisma.driverOption as any).create({
        data: { name: name.trim(), nic: nic.trim(), licenceNo: licenceNo.trim(), contact: contact?.trim() || null, carrierId },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Failed to save driver" }, { status: 409 });
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

  if (type === "brand") {
    const { name } = body;
    if (!name?.trim())
      return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
    try {
      const record = await prisma.brandOption.create({ data: { name: name.trim() } });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Brand already exists" }, { status: 409 });
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
    const { name, nic, licenceNo, contact, carrierId } = body;
    if (!name?.trim() || !nic?.trim() || !licenceNo?.trim())
      return NextResponse.json({ error: "Name, NIC, and Driving Licence No. are required" }, { status: 400 });
    if (!carrierId)
      return NextResponse.json({ error: "A driver must be assigned to a Carrier Company" }, { status: 400 });
    if (!isValidNIC(nic))
      return NextResponse.json({ error: "Invalid NIC format (e.g. 123456789V or 200012345678)" }, { status: 400 });
    if (contact?.trim() && !isValidPhone(contact))
      return NextResponse.json({ error: "Invalid contact number format" }, { status: 400 });
    const [existingByNic, existingByLicence] = await Promise.all([
      (prisma.driverOption as any).findUnique({ where: { nic: nic.trim() } }),
      (prisma.driverOption as any).findUnique({ where: { licenceNo: licenceNo.trim() } }),
    ]);
    if ((existingByNic && existingByNic.id !== id) || (existingByLicence && existingByLicence.id !== id)) {
      return NextResponse.json({
        error: (existingByNic && existingByNic.id !== id)
          ? `A driver with NIC ${nic.trim()} already exists (${existingByNic.name})`
          : `A driver with Driving Licence No. ${licenceNo.trim()} already exists (${existingByLicence.name})`,
      }, { status: 409 });
    }
    try {
      const record = await (prisma.driverOption as any).update({
        where: { id },
        data: { name: name.trim(), nic: nic.trim(), licenceNo: licenceNo.trim(), contact: contact?.trim() || null, carrierId },
      });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Failed to save driver" }, { status: 409 });
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

  if (type === "brand") {
    const { name } = body;
    if (!name?.trim())
      return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
    try {
      const record = await prisma.brandOption.update({ where: { id }, data: { name: name.trim() } });
      return NextResponse.json({ record });
    } catch {
      return NextResponse.json({ error: "Brand already exists" }, { status: 409 });
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

  if (type === "brand") {
    await prisma.brandOption.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
