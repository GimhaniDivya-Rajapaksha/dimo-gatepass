import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchSapVehicles } from "@/lib/sap";
import { fetchPlantLocationOptions, fetchPlantVehicleRows, filterApiLocations, type LocationOption } from "@/lib/location-api";

type LookupField = "location" | "requestedBy" | "outReason" | "vehicle" | "approver" | "companyName" | "carrierRegNo" | "carrier" | "driverNIC" | "driverName" | "driver";

function normalize(text: string) {
  return text.trim();
}

function inferLocationType(loc: { storageLocation: string; storageDescription: string }): string {
  if (loc.storageLocation.toUpperCase().startsWith("D")) return "DEALER";
  const desc = loc.storageDescription.trim().toLowerCase();
  if (desc === "promo location") return "PROMOTION";
  if (desc === "finan institute" || desc === "financial instit" || desc === "financial institute") return "FINANCE";
  return "DIMO";
}

const PROMO_FINANCE_DESCS = ["promo location", "finan institute", "financial instit", "financial institute", "finan.institute"];
function isPromoFinanceOption(opt: LocationOption) {
  return PROMO_FINANCE_DESCS.includes(opt.storageDescription.toLowerCase().trim());
}

async function expandByLocationLabels(db: typeof prisma, options: LocationOption[]): Promise<LocationOption[]> {
  const pfOpts = options.filter(isPromoFinanceOption);
  if (pfOpts.length === 0) return options;

  const dbLabels = await (db as any).locationLabel.findMany({
    where: { OR: pfOpts.map(o => ({ plantCode: o.plantCode, storageLocation: o.storageLocation })) },
    orderBy: { createdAt: "asc" },
  }).catch(() => []) as { plantCode: string; storageLocation: string; label: string }[];

  const labelsMap = new Map<string, string[]>();
  for (const lbl of dbLabels) {
    const key = `${lbl.plantCode}|${lbl.storageLocation}`;
    if (!labelsMap.has(key)) labelsMap.set(key, []);
    labelsMap.get(key)!.push(lbl.label);
  }

  const expanded: LocationOption[] = [];
  for (const opt of options) {
    const key = `${opt.plantCode}|${opt.storageLocation}`;
    const labels = labelsMap.get(key);
    if (labels && labels.length > 0) {
      for (const lbl of labels) {
        expanded.push({
          ...opt,
          id: `${key}|${encodeURIComponent(lbl)}`,
          value: `${opt.plantDescription} - ${lbl}`,
          label: `${opt.plantDescription} - ${lbl}`,
          storageDescription: lbl,
        });
      }
    } else {
      expanded.push(opt); // unlabelled — kept as-is
    }
  }
  return expanded;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const field = searchParams.get("field") as LookupField | null;
  const q = normalize(searchParams.get("q") ?? "");
  const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const take = field === "location" ? Math.min(rawLimit, 500) : Math.min(rawLimit, 50);
  const locationType = searchParams.get("locationType") ?? undefined;
  const chassisNo = searchParams.get("chassisNo") ?? undefined;

  const fieldsParam = searchParams.get("fields");
  if (fieldsParam) {
    const fields = fieldsParam.split(",").map((f) => f.trim()) as LookupField[];
    const locType = searchParams.get("locationType") ?? undefined;
    const dimoLocType = searchParams.get("dimoLocationType") ?? undefined;

    try {
      const [apiLocations, outReasons, approvers, companies, carriers] = await Promise.all([
        fetchPlantLocationOptions().catch(() => []),
        fields.includes("outReason") ? prisma.outReasonOption.findMany({ orderBy: { value: "asc" }, take: 50 }) : Promise.resolve([]),
        fields.includes("approver") ? prisma.user.findMany({ where: { role: "APPROVER" }, orderBy: { name: "asc" }, take: 50 }) : Promise.resolve([]),
        fields.includes("companyName") ? prisma.carrierOption.findMany({ orderBy: { companyName: "asc" }, take: 50 }) : Promise.resolve([]),
        fields.includes("carrierRegNo") ? prisma.carrierOption.findMany({ orderBy: { registrationNo: "asc" }, take: 50 }) : Promise.resolve([]),
      ]);

      // Sync SAP-derived locations to DB with inferred locationType so the DB fallback
      // can find non-DIMO destinations even when no vehicle is currently parked there.
      // Using upsert (not createMany) so existing records with null locationType are also updated.
      if (apiLocations.length > 0) {
        Promise.all(
          apiLocations.map((loc) =>
            prisma.locationOption.upsert({
              where: { plantCode_storageLocation: { plantCode: loc.plantCode, storageLocation: loc.storageLocation } },
              create: {
                plantCode: loc.plantCode,
                plantDescription: loc.plantDescription,
                storageLocation: loc.storageLocation,
                storageDescription: loc.storageDescription,
                locationType: inferLocationType(loc),
              },
              update: {
                plantDescription: loc.plantDescription,
                storageDescription: loc.storageDescription,
                locationType: inferLocationType(loc),
              },
            }).catch(() => { /* non-critical */ })
          )
        ).catch(() => { /* non-critical */ });
      }

      const locations = filterApiLocations(apiLocations, "", locType);
      const dimoLocations = dimoLocType ? filterApiLocations(apiLocations, "", dimoLocType) : [];

      return NextResponse.json({
        location: locations,
        dimoLocation: dimoLocations,
        outReason: outReasons.map((r: { id: string; value: string }) => ({ id: r.id, value: r.value, label: r.value })),
        approver: approvers.map((r: { id: string; name: string }) => ({ id: r.id, value: r.name, label: r.name })),
        companyName: (companies as { id: string; companyName: string; registrationNo: string }[]).map((r) => ({
          id: r.id,
          value: r.companyName,
          label: r.companyName,
          registrationNo: r.registrationNo,
        })),
        carrierRegNo: (carriers as { id: string; registrationNo: string; companyName: string }[]).map((r) => ({
          id: r.id,
          value: r.registrationNo,
          label: `${r.registrationNo} - ${r.companyName}`,
          companyName: r.companyName,
        })),
      });
    } catch (e) {
      console.error("Bulk lookups error:", e);
      return NextResponse.json({ error: "Lookup error" }, { status: 500 });
    }
  }

  if (!field) return NextResponse.json({ options: [] });

  try {
    if (field === "location") {
      const matnr = searchParams.get("matnr") ?? undefined;

      if (chassisNo || matnr) {
        // Per-vehicle query: /plant?filter=VIN returns one row per ext destination for that vehicle.
        // The unfiltered /plant call returns current-location rows only (no ext_plant/ext_sloc).
        const vehicleFilter = chassisNo || matnr || "";
        const allRows = await fetchPlantVehicleRows(vehicleFilter).catch(() => []);

        // Defensive in-memory filter in case the SAP filter returns extra rows
        let vehicleRows = chassisNo
          ? allRows.filter(r => !r.chassisNo || r.chassisNo.toUpperCase() === chassisNo.toUpperCase())
          : [];
        if (!vehicleRows.length && matnr) {
          vehicleRows = allRows.filter(r => r.materialNo === matnr);
        }
        if (!vehicleRows.length) vehicleRows = allRows; // use all if filter didn't narrow down

        // Build one option per unique ext_plant|ext_sloc destination.
        // Descriptions come directly from ext_p_des / ext_sloc_des fields in the API response.
        const seen = new Set<string>();
        const options: LocationOption[] = [];
        for (const row of vehicleRows) {
          if (!row.extPlant || !row.extSloc) continue;
          const id = `${row.extPlant}|${row.extSloc}`;
          if (seen.has(id)) continue;
          seen.add(id);

          const plantDesc = row.extPlantDesc || row.extPlant;
          const slocDesc  = row.extSlocDesc  || row.extSloc;
          options.push({
            id, value: `${plantDesc} - ${slocDesc}`, label: `${plantDesc} - ${slocDesc}`,
            plantCode: row.extPlant, plantDescription: plantDesc,
            storageLocation: row.extSloc, storageDescription: slocDesc,
            source: "api",
          });
        }

        // Filter by locationType FIRST (while storageDescription still has the raw SAP value
        // so inferType can correctly classify "Promo location" → PROMOTION, etc.).
        // Overlaying custom DB labels before this step would break inferType for renamed entries.
        const filteredOptions = filterApiLocations(options, q, locationType);

        return NextResponse.json({ options: (await expandByLocationLabels(prisma, filteredOptions)).slice(0, take) });
      }

      const isNonDimo = locationType === "PROMOTION" || locationType === "FINANCE" || locationType === "DEALER";
      const [apiLocations, dbRows] = await Promise.all([
        fetchPlantLocationOptions().catch(() => []),
        isNonDimo ? prisma.locationOption.findMany() : Promise.resolve([]),
      ]);

      // SAP live — filtered by type + query
      const filteredApi = filterApiLocations(apiLocations, q, locationType);
      const apiKeys = new Set(filteredApi.map((l) => `${l.plantCode}|${l.storageLocation}`));

      // DB fallback for non-DIMO types: adds locations that are in the DB (from prior syncs or manual adds)
      // but currently have no vehicles in SAP so they're invisible in the live feed.
      const dbAdditions: typeof filteredApi = [];
      if (isNonDimo) {
        for (const dbloc of dbRows) {
          const key = `${dbloc.plantCode}|${dbloc.storageLocation}`;
          if (apiKeys.has(key)) continue;
          const storageDesc = dbloc.storageDescription || dbloc.storageLocation;
          const value = [dbloc.plantDescription, storageDesc].filter(Boolean).join(" - ");
          if (!value) continue;

          // Match by explicit locationType stored in DB, or by exact description inference
          const inferredType = (() => {
            if (dbloc.storageLocation.toUpperCase().startsWith("D")) return "DEALER";
            const desc = storageDesc.trim().toLowerCase();
            if (desc === "promo location") return "PROMOTION";
            if (desc === "finan institute" || desc === "financial instit" || desc === "financial institute") return "FINANCE";
            return "DIMO";
          })();
          if (dbloc.locationType !== locationType && inferredType !== locationType) continue;

          if (q && ![value, dbloc.plantCode, dbloc.storageLocation].join(" ").toLowerCase().includes(q.toLowerCase())) continue;

          dbAdditions.push({
            id: key,
            value,
            label: value,
            plantCode: dbloc.plantCode,
            plantDescription: dbloc.plantDescription,
            storageLocation: dbloc.storageLocation,
            storageDescription: storageDesc,
            source: "db" as const,
          });
        }
      }

      const allOptions = [...filteredApi, ...dbAdditions];
      return NextResponse.json({ options: (await expandByLocationLabels(prisma, allOptions)).slice(0, take) });
    }

    if (field === "requestedBy") {
      const users = await prisma.user.findMany({
        where: q
          ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
          : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
        take,
      });
      return NextResponse.json({
        options: users.map((u) => ({ id: u.id, value: u.name, label: u.name, email: u.email })),
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
      const rawPassType = searchParams.get("passType") ?? "both";
      const passType = (rawPassType === "AFTER_SALES" ? "both" : rawPassType) as
        "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "both";

      const merged = new Map<string, {
        id: string;
        value: string;
        label: string;
        chassisNo: string;
        description: string;
        model: string;
        make: string;
        colourFamily: string;
        colour: string;
        matnr: string;
        internalNo: string;
      }>();

      // Fetch from /in|/out (business status filtered) AND /plant (all vehicles) in parallel
      const [sapResult, plantResult] = await Promise.allSettled([
        fetchSapVehicles(q, passType),
        fetchPlantVehicleRows(),
      ]);

      // Build Matnr lookup from /plant to cross-reference SAP /in/out entries
      const plantMatnrByInternalNo = new Map<string, string>();
      if (plantResult.status === "fulfilled") {
        for (const row of plantResult.value) {
          if (row.internalNo && row.materialNo) {
            plantMatnrByInternalNo.set(row.internalNo.toUpperCase(), row.materialNo);
          }
        }
      }

      const seenInternalNos = new Set<string>();

      if (sapResult.status === "fulfilled") {
        sapResult.value.slice(0, take).forEach((v, i) => {
          const key = `${(v.vehicleNo || "").toUpperCase()}::${(v.chassisNo || "").toUpperCase()}`;
          if (merged.has(key)) return;
          if (v.internalNo) seenInternalNos.add(v.internalNo.toUpperCase());
          const matnr = v.internalNo ? (plantMatnrByInternalNo.get(v.internalNo.toUpperCase()) ?? "") : "";
          merged.set(key, {
            id: `${v.internalNo || v.chassisNo || v.vehicleNo || i}-${i}`,
            value: v.vehicleNo || v.chassisNo,
            label: v.vehicleNo && v.chassisNo ? `${v.vehicleNo} / ${v.chassisNo}` : (v.vehicleNo || v.chassisNo),
            chassisNo: v.chassisNo ?? "",
            description: v.model ?? "",
            model: v.model ?? "",
            make: v.make ?? "",
            colourFamily: "",
            colour: v.colour ?? "",
            matnr,
            internalNo: v.internalNo ?? "",
          });
        });
      } else {
        console.warn("[lookups/vehicle] SAP /in|/out error:", sapResult.reason instanceof Error ? sapResult.reason.message : sapResult.reason);
      }

      // Merge plant API vehicles — these cover vehicles not yet in business flow (no QP30/QS60)
      if (plantResult.status === "fulfilled") {
        const safe = q.trim().toUpperCase();
        const filtered = safe
          ? plantResult.value.filter((row) =>
              row.chassisNo.toUpperCase().includes(safe) ||
              row.externalNo.toUpperCase().includes(safe) ||
              row.internalNo.toUpperCase().includes(safe)
            )
          : plantResult.value;

        filtered.forEach((row, i) => {
          if (row.internalNo && seenInternalNos.has(row.internalNo.toUpperCase())) return;
          const identifier = row.externalNo || row.chassisNo || row.internalNo;
          if (!identifier) return;
          const key = `PLANT::${row.internalNo.toUpperCase() || identifier.toUpperCase()}`;
          if (merged.has(key)) return;
          merged.set(key, {
            id: `plant-${row.internalNo || i}`,
            value: identifier,
            label: row.chassisNo && row.externalNo && row.externalNo !== row.chassisNo
              ? `${row.externalNo} / ${row.chassisNo}`
              : identifier,
            chassisNo: row.chassisNo ?? "",
            description: row.modelCode ?? "",
            model: row.modelCode ?? "",
            make: "",
            colourFamily: "",
            colour: "",
            matnr: row.materialNo ?? "",
            internalNo: row.internalNo ?? "",
          });
        });
      }

      const options = await prisma.vehicleOption.findMany({
        where: q
          ? {
              OR: [
                { vehicleNo: { contains: q, mode: "insensitive" } },
                { chassisNo: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { make: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { vehicleNo: "asc" },
        take,
      });

      options.forEach((row) => {
        const key = `${(row.vehicleNo || "").toUpperCase()}::${(row.chassisNo || "").toUpperCase()}`;
        if (merged.has(key)) return;
        merged.set(key, {
          id: row.id,
          value: row.vehicleNo,
          chassisNo: row.chassisNo ?? "",
          description: row.description ?? "",
          model: row.model ?? "",
          make: row.make ?? "",
          colourFamily: row.colourFamily ?? "",
          colour: row.colour ?? "",
          label: row.chassisNo ? `${row.vehicleNo} / ${row.chassisNo}` : row.vehicleNo,
          matnr: "",
          internalNo: "",
        });
      });

      const safe = q.trim().toUpperCase();
      const sorted = Array.from(merged.values()).sort((a, b) => {
        const aStarts = a.value.toUpperCase().startsWith(safe) || a.chassisNo.toUpperCase().startsWith(safe);
        const bStarts = b.value.toUpperCase().startsWith(safe) || b.chassisNo.toUpperCase().startsWith(safe);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.value.localeCompare(b.value);
      });

      return NextResponse.json({
        options: sorted.slice(0, take),
        source: "combined",
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
          label: `${row.registrationNo} - ${row.companyName}`,
          companyName: row.companyName,
        })),
      });
    }

    if (field === "driverNIC") {
      const drivers = await (prisma as any).driverOption.findMany({
        where: q ? { OR: [{ nic: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : undefined,
        orderBy: { nic: "asc" },
        take,
      });
      return NextResponse.json({
        options: drivers.map((d: { id: string; name: string; nic: string; contact: string | null }) => ({
          id: d.id, value: d.nic, label: `${d.nic} — ${d.name}`,
          driverName: d.name, driverContact: d.contact ?? "",
        })),
      });
    }

    if (field === "driverName") {
      const drivers = await (prisma as any).driverOption.findMany({
        where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nic: { contains: q, mode: "insensitive" } }] } : undefined,
        orderBy: { name: "asc" },
        take,
      });
      return NextResponse.json({
        options: drivers.map((d: { id: string; name: string; nic: string; contact: string | null }) => ({
          id: d.id, value: d.name, label: `${d.name} (${d.nic})`,
          driverNIC: d.nic, driverContact: d.contact ?? "",
        })),
      });
    }

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
  const allowedToPost = ["INITIATOR", "ADMIN", "SECURITY_OFFICER", "SERVICE_ADVISOR", "AREA_SALES_OFFICER"];
  if (!session || !allowedToPost.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const field = body.field as LookupField | undefined;

  if (field === "location") {
    // Plant code + sloc code MUST come from the API — no placeholder generation.
    // Saves a new label for a PROMO/FINANCE sloc; multiple labels per sloc are allowed.
    const plantCode = normalize(body.plantCode ?? "").toUpperCase();
    const storageLocation = normalize(body.storageLocation ?? "").toUpperCase();
    const plantDescription = normalize(body.plantDescription ?? "");
    const storageDescription = normalize(body.storageDescription ?? "");
    const locationType = normalize(body.locationType ?? "") as string;

    if (!plantCode || !storageLocation) {
      return NextResponse.json({ error: "plantCode and storageLocation are required" }, { status: 400 });
    }
    if (!storageDescription) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }
    if (!["PROMOTION", "FINANCE"].includes(locationType)) {
      return NextResponse.json({ error: "locationType must be PROMOTION or FINANCE" }, { status: 400 });
    }

    try {
      // Cache plant/sloc in LocationOption (for non-chassis fallback path)
      await prisma.locationOption.upsert({
        where: { plantCode_storageLocation: { plantCode, storageLocation } },
        create: {
          plantCode, plantDescription, storageLocation,
          storageDescription: locationType === "PROMOTION" ? "Promo location" : "Finan Institute",
          locationType,
        },
        update: { locationType, ...(plantDescription ? { plantDescription } : {}) },
      });

      // Add new label — labels are immutable once saved (no update field)
      await (prisma as any).locationLabel.upsert({
        where: { plantCode_storageLocation_label: { plantCode, storageLocation, label: storageDescription } },
        create: { plantCode, storageLocation, label: storageDescription },
        update: {},
      });

      return NextResponse.json({
        option: {
          id: `${plantCode}|${storageLocation}|${encodeURIComponent(storageDescription)}`,
          value: `${plantDescription} - ${storageDescription}`,
          label: `${plantDescription} - ${storageDescription}`,
          plantCode,
          plantDescription,
          storageLocation,
          storageDescription,
          source: "db",
        },
      });
    } catch (e) {
      console.error("Location label save error:", e);
      return NextResponse.json({ error: "Failed to save location label." }, { status: 500 });
    }
  }

  if (field === "carrier") {
    const companyName = normalize(body.companyName ?? "");
    const registrationNo = normalize(body.registrationNo ?? "");
    if (!companyName || !registrationNo) {
      return NextResponse.json({ error: "companyName and registrationNo are required" }, { status: 400 });
    }
    try {
      const created = await prisma.carrierOption.upsert({
        where: { registrationNo },
        update: { companyName },
        create: { companyName, registrationNo },
      });
      return NextResponse.json({
        option: { id: created.id, companyName: created.companyName, registrationNo: created.registrationNo },
      });
    } catch (e) {
      console.error("Carrier create error:", e);
      return NextResponse.json({ error: "Failed to save carrier." }, { status: 500 });
    }
  }

  if (field === "driver") {
    const name = normalize(body.name ?? "");
    const nic  = normalize(body.nic  ?? "");
    const contact = normalize(body.contact ?? "") || null;
    if (!name || !nic) return NextResponse.json({ error: "name and nic are required" }, { status: 400 });
    try {
      const created = await (prisma as any).driverOption.upsert({
        where: { nic },
        update: { name, contact },
        create: { name, nic, contact },
      });
      return NextResponse.json({ option: { id: created.id, name: created.name, nic: created.nic, contact: created.contact } });
    } catch (e) {
      console.error("Driver save error:", e);
      return NextResponse.json({ error: "Failed to save driver." }, { status: 500 });
    }
  }

  if (field !== "vehicle") {
    return NextResponse.json({ error: "Only vehicle creation is supported." }, { status: 400 });
  }

  const vehicleNo = normalize(body.vehicleNo ?? "");
  const chassisNo = normalize(body.chassisNo ?? "");
  const description = normalize(body.description ?? "");
  const model = normalize(body.model ?? "");
  const make = normalize(body.make ?? "");
  const colourFamily = normalize(body.colourFamily ?? "");
  const colour = normalize(body.colour ?? "");

  if (!vehicleNo) {
    return NextResponse.json({ error: "vehicleNo is required." }, { status: 400 });
  }

  try {
    const created = await prisma.vehicleOption.upsert({
      where: { vehicleNo },
      update: {
        chassisNo: chassisNo || null,
        description: description || null,
        model: model || null,
        make: make || null,
        colourFamily: colourFamily || null,
        colour: colour || null,
      },
      create: {
        vehicleNo,
        chassisNo: chassisNo || null,
        description: description || null,
        model: model || null,
        make: make || null,
        colourFamily: colourFamily || null,
        colour: colour || null,
      },
    });

    return NextResponse.json({
      option: {
        id: created.id,
        value: created.vehicleNo,
        chassisNo: created.chassisNo ?? "",
        description: created.description ?? "",
        model: created.model ?? "",
        make: created.make ?? "",
        colourFamily: created.colourFamily ?? "",
        colour: created.colour ?? "",
        label: created.chassisNo ? `${created.vehicleNo} / ${created.chassisNo}` : created.vehicleNo,
      },
    });
  } catch (e) {
    console.error("Vehicle create error:", e);
    return NextResponse.json({ error: "Failed to create vehicle." }, { status: 500 });
  }
}
