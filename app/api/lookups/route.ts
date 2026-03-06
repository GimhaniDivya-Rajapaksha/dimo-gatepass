import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LookupField = "location" | "requestedBy" | "outReason" | "vehicle" | "approver" | "companyName" | "carrierRegNo";

function normalize(text: string) {
  return text.trim();
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const field = searchParams.get("field") as LookupField | null;
  const q = normalize(searchParams.get("q") ?? "");
  const take = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const locationType = searchParams.get("locationType") ?? undefined;

  if (!field) return NextResponse.json({ options: [] });

  try {
    if (field === "location") {
      const options = await prisma.locationOption.findMany({
        where: {
          ...(locationType ? { locationType } : {}),
          ...(q
            ? {
                OR: [
                  { plantCode: { contains: q, mode: "insensitive" } },
                  { plantDescription: { contains: q, mode: "insensitive" } },
                  { storageLocation: { contains: q, mode: "insensitive" } },
                  { storageDescription: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ plantCode: "asc" }, { storageDescription: "asc" }],
        take,
      });
      return NextResponse.json({
        options: options.map((row) => ({
          id: row.id,
          value: `${row.plantCode} - ${row.storageDescription}`,
          label: `${row.plantCode} - ${row.storageDescription}`,
          plantCode: row.plantCode,
          plantDescription: row.plantDescription,
          storageLocation: row.storageLocation,
        })),
      });
    }

    if (field === "requestedBy") {
      const options = await prisma.requestedByOption.findMany({
        where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
        orderBy: { name: "asc" },
        take,
      });
      return NextResponse.json({
        options: options.map((row) => ({ id: row.id, value: row.name, label: row.name })),
      });
    }

    if (field === "outReason") {
      const options = await prisma.outReasonOption.findMany({
        where: q ? { value: { contains: q, mode: "insensitive" } } : undefined,
        orderBy: { value: "asc" },
        take,
      });
      return NextResponse.json({
        options: options.map((row) => ({ id: row.id, value: row.value, label: row.value })),
      });
    }

    if (field === "vehicle") {
      const options = await prisma.vehicleOption.findMany({
        where: q
          ? {
              OR: [
                { vehicleNo:   { contains: q, mode: "insensitive" } },
                { chassisNo:   { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { model:       { contains: q, mode: "insensitive" } },
                { make:        { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { vehicleNo: "asc" },
        take,
      });
      return NextResponse.json({
        options: options.map((row) => ({
          id: row.id,
          value: row.vehicleNo,
          chassisNo: row.chassisNo ?? "",
          description: row.description ?? "",
          label: row.chassisNo ? `${row.vehicleNo} / ${row.chassisNo}` : row.vehicleNo,
        })),
      });
    }

    if (field === "companyName") {
      const options = await prisma.carrierOption.findMany({
        where: q ? { companyName: { contains: q, mode: "insensitive" } } : undefined,
        orderBy: { companyName: "asc" },
        take,
      });
      return NextResponse.json({
        options: options.map((row) => ({
          id: row.id,
          value: row.companyName,
          label: row.companyName,
          registrationNo: row.registrationNo,
        })),
      });
    }

    if (field === "carrierRegNo") {
      const options = await prisma.carrierOption.findMany({
        where: q ? { registrationNo: { contains: q, mode: "insensitive" } } : undefined,
        orderBy: { registrationNo: "asc" },
        take,
      });
      return NextResponse.json({
        options: options.map((row) => ({
          id: row.id,
          value: row.registrationNo,
          label: `${row.registrationNo} — ${row.companyName}`,
          companyName: row.companyName,
        })),
      });
    }

    // approver
    const options = await prisma.user.findMany({
      where: {
        role: "APPROVER",
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take,
    });
    return NextResponse.json({
      options: options.map((row) => ({ id: row.id, value: row.name, label: row.name })),
    });
  } catch (e) {
    console.error("Lookups error:", e);
    return NextResponse.json({ options: [] });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "INITIATOR" && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const field = body.field as LookupField | undefined;

  if (field !== "vehicle") {
    return NextResponse.json({ error: "Only vehicle creation is supported." }, { status: 400 });
  }

  const vehicleNo    = normalize(body.vehicleNo    ?? "");
  const chassisNo    = normalize(body.chassisNo    ?? "");
  const description  = normalize(body.description  ?? "");
  const model        = normalize(body.model        ?? "");
  const make         = normalize(body.make         ?? "");
  const colourFamily = normalize(body.colourFamily ?? "");
  const colour       = normalize(body.colour       ?? "");

  if (!vehicleNo) {
    return NextResponse.json({ error: "vehicleNo is required." }, { status: 400 });
  }

  try {
    const created = await prisma.vehicleOption.upsert({
      where: { vehicleNo },
      update: {
        chassisNo:    chassisNo    || null,
        description:  description  || null,
        model:        model        || null,
        make:         make         || null,
        colourFamily: colourFamily || null,
        colour:       colour       || null,
      },
      create: {
        vehicleNo,
        chassisNo:    chassisNo    || null,
        description:  description  || null,
        model:        model        || null,
        make:         make         || null,
        colourFamily: colourFamily || null,
        colour:       colour       || null,
      },
    });
    return NextResponse.json({
      option: {
        id: created.id,
        value: created.vehicleNo,
        chassisNo: created.chassisNo ?? "",
        label: created.chassisNo ? `${created.vehicleNo} / ${created.chassisNo}` : created.vehicleNo,
      },
    });
  } catch (e) {
    console.error("Vehicle create error:", e);
    return NextResponse.json({ error: "Failed to create vehicle." }, { status: 500 });
  }
}
