import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchSapVehicles } from "@/lib/sap";

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
  const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  // Locations need a higher cap to show full lists without typing
  const take = field === "location" ? Math.min(rawLimit, 500) : Math.min(rawLimit, 50);
  const locationType = searchParams.get("locationType") ?? undefined;

  // ── Bulk mode: ?fields=location,outReason,approver,... ──────────────────
  const fieldsParam = searchParams.get("fields");
  if (fieldsParam) {
    const fields = fieldsParam.split(",").map(f => f.trim()) as LookupField[];
    const locType = searchParams.get("locationType") ?? undefined;
    const dimoLocType = searchParams.get("dimoLocationType") ?? undefined;
    try {
      const [locations, dimoLocations, outReasons, approvers, companies, carriers] = await Promise.all([
        prisma.locationOption.findMany({
          where: locType ? { locationType: locType } as Record<string, unknown> : {},
          orderBy: [{ plantCode: "asc" }, { storageDescription: "asc" }],
          take: 300,
        }),
        dimoLocType
          ? prisma.locationOption.findMany({
              where: { locationType: dimoLocType } as Record<string, unknown>,
              orderBy: [{ plantCode: "asc" }, { storageDescription: "asc" }],
              take: 200,
            })
          : Promise.resolve([]),
        fields.includes("outReason") ? prisma.outReasonOption.findMany({ orderBy: { value: "asc" }, take: 50 }) : Promise.resolve([]),
        fields.includes("approver") ? prisma.user.findMany({ where: { role: "APPROVER" }, orderBy: { name: "asc" }, take: 50 }) : Promise.resolve([]),
        fields.includes("companyName") ? prisma.carrierOption.findMany({ orderBy: { companyName: "asc" }, take: 50 }) : Promise.resolve([]),
        fields.includes("carrierRegNo") ? prisma.carrierOption.findMany({ orderBy: { registrationNo: "asc" }, take: 50 }) : Promise.resolve([]),
      ]);
      const mapLoc = (row: { id: string; plantCode: string; plantDescription: string; storageLocation: string; storageDescription: string }) => ({
        id: row.id,
        value: `${row.plantDescription} - ${row.storageDescription}`,
        label: `${row.plantDescription} – ${row.storageDescription}`,
        plantCode: row.plantCode,
        plantDescription: row.plantDescription,
        storageLocation: row.storageLocation,
        storageDescription: row.storageDescription,
      });
      return NextResponse.json({
        location: locations.map(mapLoc),
        dimoLocation: dimoLocations.map(mapLoc),
        outReason: outReasons.map((r: { id: string; value: string }) => ({ id: r.id, value: r.value, label: r.value })),
        approver: approvers.map((r: { id: string; name: string }) => ({ id: r.id, value: r.name, label: r.name })),
        companyName: (companies as { id: string; companyName: string; registrationNo: string }[]).map(r => ({ id: r.id, value: r.companyName, label: r.companyName, registrationNo: r.registrationNo })),
        carrierRegNo: (carriers as { id: string; registrationNo: string; companyName: string }[]).map(r => ({ id: r.id, value: r.registrationNo, label: `${r.registrationNo} — ${r.companyName}`, companyName: r.companyName })),
      });
    } catch (e) {
      console.error("Bulk lookups error:", e);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
  }

  if (!field) return NextResponse.json({ options: [] });

  try {
    if (field === "location") {
      type LocRow = { id: string; plantCode: string; plantDescription: string; storageLocation: string; storageDescription: string };
      let rows: LocRow[];

      if (locationType) {
        // Use raw SQL — locationType column may not be in generated Prisma client yet
        if (q) {
          const like = `%${q}%`;
          rows = await prisma.$queryRaw<LocRow[]>`
            SELECT id, "plantCode", "plantDescription", "storageLocation", "storageDescription"
            FROM "LocationOption"
            WHERE "locationType" = ${locationType}
              AND ("plantCode" ILIKE ${like} OR "plantDescription" ILIKE ${like}
                OR "storageLocation" ILIKE ${like} OR "storageDescription" ILIKE ${like})
            ORDER BY "plantCode" ASC, "storageDescription" ASC
            LIMIT ${take}
          `;
        } else {
          rows = await prisma.$queryRaw<LocRow[]>`
            SELECT id, "plantCode", "plantDescription", "storageLocation", "storageDescription"
            FROM "LocationOption"
            WHERE "locationType" = ${locationType}
            ORDER BY "plantCode" ASC, "storageDescription" ASC
            LIMIT ${take}
          `;
        }
      } else {
        rows = await prisma.locationOption.findMany({
          where: q ? {
            OR: [
              { plantCode: { contains: q, mode: "insensitive" } },
              { plantDescription: { contains: q, mode: "insensitive" } },
              { storageLocation: { contains: q, mode: "insensitive" } },
              { storageDescription: { contains: q, mode: "insensitive" } },
            ],
          } : {},
          orderBy: [{ plantCode: "asc" }, { storageDescription: "asc" }],
          take,
        });
      }

      return NextResponse.json({
        options: rows.map((row) => ({
          id: row.id,
          value: `${row.plantDescription} - ${row.storageDescription}`,
          label: `${row.plantDescription} – ${row.storageDescription}`,
          plantCode: row.plantCode,
          plantDescription: row.plantDescription,
          storageLocation: row.storageLocation,
          storageDescription: row.storageDescription,
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
      // ── 1. Try SAP first ────────────────────────────────────────────────
      const rawPassType = searchParams.get("passType") ?? "both";
      // AFTER_SALES → use both SAP endpoints (IN + OUT) to load all vehicles
      const passType = (rawPassType === "AFTER_SALES" ? "both" : rawPassType) as
        "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "both";

      try {
        const sapVehicles = await fetchSapVehicles(q, passType);
        if (sapVehicles.length > 0) {
          return NextResponse.json({
            options: sapVehicles.slice(0, take).map((v, i) => ({
              id:           `${v.internalNo || v.chassisNo || v.vehicleNo || i}-${i}`,
              value:        v.vehicleNo || v.chassisNo,   // license plate preferred, fall back to VIN
              label:        v.vehicleNo && v.chassisNo
                              ? `${v.vehicleNo} / ${v.chassisNo}`
                              : (v.vehicleNo || v.chassisNo),
              chassisNo:    v.chassisNo,
              description:  v.model,
              model:        v.model,
              make:         v.make,
              colourFamily: "",
              colour:       v.colour,
            })),
            source: "sap",
          });
        }
      } catch (sapErr) {
        // SAP unavailable — fall through to local DB
        console.warn("[lookups/vehicle] SAP error, falling back to local DB:", sapErr instanceof Error ? sapErr.message : sapErr);
      }

      // ── 2. Fallback: local VehicleOption DB ─────────────────────────────
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
          id:           row.id,
          value:        row.vehicleNo,
          chassisNo:    row.chassisNo    ?? "",
          description:  row.description  ?? "",
          model:        row.model        ?? "",
          make:         row.make         ?? "",
          colourFamily: row.colourFamily ?? "",
          colour:       row.colour       ?? "",
          label:        row.chassisNo
                          ? `${row.vehicleNo} / ${row.chassisNo}`
                          : row.vehicleNo,
        })),
        source: "local",
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
  const allowedToPost = ["INITIATOR", "ADMIN", "SECURITY_OFFICER", "SERVICE_ADVISOR"];
  if (!session || !allowedToPost.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const field = body.field as LookupField | undefined;

  // ── Create a new Promotion / Finance location ───────────────────────
  if (field === "location") {
    const plantDescription = normalize(body.plantDescription ?? "");
    const locationType = normalize(body.locationType ?? "") as string;

    if (!plantDescription) return NextResponse.json({ error: "plantDescription required" }, { status: 400 });
    if (!["PROMOTION", "FINANCE"].includes(locationType)) {
      return NextResponse.json({ error: "locationType must be PROMOTION or FINANCE" }, { status: 400 });
    }

    // Use provided storageDescription or fall back to type default
    const storageDescRaw = normalize(body.storageDescription ?? "");
    const storageDescription = storageDescRaw || (locationType === "PROMOTION" ? "Promo Location" : "Finan Institute");

    // Derive plantCode from initials (up to 6 chars)
    const plantCode = plantDescription.split(/\s+/).map((w: string) => w[0] ?? "").join("").toUpperCase().slice(0, 6);

    try {
      // Find next available Sloc number for this plantCode
      const existing = await prisma.locationOption.findMany({
        where: { plantCode },
        orderBy: { storageLocation: "desc" },
        take: 1,
      });
      const lastNum = existing.length > 0 ? (parseInt(existing[0].storageLocation.replace(/\D/g, ""), 10) || 99) : 99;
      const storageLocation = `S${lastNum + 1}`;

      const created = await prisma.locationOption.create({
        data: { plantCode, plantDescription, storageLocation, storageDescription, locationType },
      });
      return NextResponse.json({
        option: {
          id: created.id,
          value: `${created.plantDescription} - ${created.storageDescription}`,
          label: `${created.plantDescription} – ${created.storageDescription}`,
          plantCode: created.plantCode,
          plantDescription: created.plantDescription,
          storageLocation: created.storageLocation,
          storageDescription: created.storageDescription,
        },
      });
    } catch (e) {
      console.error("Location create error:", e);
      return NextResponse.json({ error: "Failed to create location." }, { status: 500 });
    }
  }

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
        chassisNo:    created.chassisNo    ?? "",
        description:  created.description  ?? "",
        model:        created.model        ?? "",
        make:         created.make         ?? "",
        colourFamily: created.colourFamily ?? "",
        colour:       created.colour       ?? "",
        label: created.chassisNo ? `${created.vehicleNo} / ${created.chassisNo}` : created.vehicleNo,
      },
    });
  } catch (e) {
    console.error("Vehicle create error:", e);
    return NextResponse.json({ error: "Failed to create vehicle." }, { status: 500 });
  }
}
