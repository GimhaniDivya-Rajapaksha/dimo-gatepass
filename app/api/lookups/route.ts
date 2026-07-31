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

// Same format rules already enforced on the Gate Pass creation form's driver fields.
function isValidNIC(v: string) {
  return /^[0-9]{9}[VvXx]$/.test(v.trim()) || /^[0-9]{12}$/.test(v.trim());
}
function isValidPhone(v: string) {
  return /^[0-9+\-\s]{7,15}$/.test(v.trim());
}
// Sri Lankan driving licence number: 1 letter followed by 7 digits (e.g. B1234567).
function isValidLicenceNo(v: string) {
  return /^[A-Za-z][0-9]{7}$/.test(v.trim());
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

  // An Approver initiating their own gate pass must only ever find their mapped Special
  // Approver here, never a normal Approver — every other creator role is unaffected.
  const approverLookupRole = session.user.role === "APPROVER" ? "SPECIAL_APPROVER" : "APPROVER";

  const fieldsParam = searchParams.get("fields");
  if (fieldsParam) {
    const fields = fieldsParam.split(",").map((f) => f.trim()) as LookupField[];
    const locType = searchParams.get("locationType") ?? undefined;
    const dimoLocType = searchParams.get("dimoLocationType") ?? undefined;

    try {
      const [apiLocations, outReasons, approvers, companies, carriers] = await Promise.all([
        fetchPlantLocationOptions().catch(() => []),
        fields.includes("outReason") ? prisma.outReasonOption.findMany({ orderBy: { value: "asc" }, take: 50 }) : Promise.resolve([]),
        fields.includes("approver") ? prisma.user.findMany({ where: { role: approverLookupRole as any }, orderBy: { name: "asc" }, take: 50 }) : Promise.resolve([]),
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
        // Use the unfiltered ALL-vehicles SAP call — it returns every vehicle with its
        // ext_plant / ext_sloc destinations included. Filter in-memory by VIN / matnr.
        // (Previously a per-vehicle ?filter=VIN URL was tried here but that endpoint
        //  returned wrong VINs or no ext data, causing PROMO/FINANCE to be empty.)
        const allRows = await fetchPlantVehicleRows().catch(() => []);

        // Find this vehicle's rows — prefer chassisNo (VIN), fallback to matnr
        let vehicleRows = chassisNo
          ? allRows.filter(r => r.chassisNo.toUpperCase() === chassisNo.toUpperCase())
          : [];
        if (!vehicleRows.length && matnr) {
          vehicleRows = allRows.filter(r => r.materialNo === matnr);
        }

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
        // Cross-vehicle fallback removed per explicit instruction — if this vehicle has no
        // matching ext_sloc entries of the requested type, the list is empty (no other
        // vehicle's SAP history is searched).
        const filteredOptions = filterApiLocations(options, q, locationType);

        return NextResponse.json({ options: (await expandByLocationLabels(prisma, filteredOptions)).slice(0, take) });
      }

      // No vehicle selected — SAP live data only for all types (DIMO/DEALER/PROMOTION/FINANCE).
      // DEALER's DB fallback (locationOption additions) has been removed per explicit instruction —
      // every type now sources purely from SAP's ext_plant/ext_sloc destinations, no DB additions.
      const apiLocations = await fetchPlantLocationOptions().catch(() => []);
      const filteredApi = filterApiLocations(apiLocations, q, locationType);

      return NextResponse.json({ options: (await expandByLocationLabels(prisma, filteredApi)).slice(0, take) });
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
        colour: string;
        matnr: string;
        internalNo: string;
        sapCurrentLocation: string;
      }>();

      // Fetch from /in|/out (business status filtered) AND /plant (all vehicles) in parallel
      let [sapResult, plantResult] = await Promise.allSettled([
        fetchSapVehicles(q, passType),
        fetchPlantVehicleRows(),
      ]);

      // Retry once if Azure APIM cold start returned nothing for a real search query
      if (q.trim() && (sapResult.status === "rejected" || (sapResult.status === "fulfilled" && sapResult.value.length === 0))) {
        await new Promise<void>((r) => setTimeout(r, 1000));
        [sapResult, plantResult] = await Promise.allSettled([
          fetchSapVehicles(q, passType),
          fetchPlantVehicleRows(),
        ]);
      }

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
            colour: v.colour ?? "",
            matnr,
            internalNo: v.internalNo ?? "",
            sapCurrentLocation: [v.plantName, v.storageName].filter(Boolean).join(" - "),
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
            colour: "",
            matnr: row.materialNo ?? "",
            internalNo: row.internalNo ?? "",
            sapCurrentLocation: "",
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
          colour: row.colour ?? "",
          label: row.chassisNo ? `${row.vehicleNo} / ${row.chassisNo}` : row.vehicleNo,
          matnr: "",
          internalNo: "",
          sapCurrentLocation: "",
        });
      });

      const safe = q.trim().toUpperCase();
      let sorted = Array.from(merged.values()).sort((a, b) => {
        const aStarts = a.value.toUpperCase().startsWith(safe) || a.chassisNo.toUpperCase().startsWith(safe);
        const bStarts = b.value.toUpperCase().startsWith(safe) || b.chassisNo.toUpperCase().startsWith(safe);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.value.localeCompare(b.value);
      });

      // CD only: exclude vehicles that already have an active or completed CD gate pass.
      // REJECTED and CANCELLED are the only statuses where a new CD is allowed.
      // LT vehicles are unaffected — they stay visible until their CD is completed.
      let alreadyDeliveredInfo: { gatePassNumber: string; gateOutBy: string | null; departureDate: string | null; departureTime: string | null } | null = null;
      if (rawPassType === "CUSTOMER_DELIVERY") {
        const usedCdPasses = await prisma.gatePass.findMany({
          where: { passType: "CUSTOMER_DELIVERY", status: { notIn: ["REJECTED", "CANCELLED"] } },
          select: { vehicle: true, chassis: true, status: true, gatePassNumber: true, gateOutBy: true, departureDate: true, departureTime: true },
        });
        const usedPlates  = new Set(usedCdPasses.map(p => (p.vehicle  ?? "").toUpperCase()).filter(Boolean));
        const usedChassis = new Set(usedCdPasses.map(p => (p.chassis  ?? "").toUpperCase()).filter(Boolean));
        sorted = sorted.filter(v =>
          !usedPlates.has(v.value.toUpperCase()) && !usedChassis.has(v.chassisNo.toUpperCase())
        );

        // Informational only: surface details when the search matches a vehicle that
        // was already Customer Delivered, so the empty result isn't mistaken for a bug.
        const needle = q.trim().toUpperCase();
        if (needle) {
          const delivered = usedCdPasses.find(p =>
            p.status === "COMPLETED" &&
            ((p.vehicle ?? "").toUpperCase().includes(needle) || (p.chassis ?? "").toUpperCase().includes(needle))
          );
          if (delivered) {
            alreadyDeliveredInfo = {
              gatePassNumber: delivered.gatePassNumber,
              gateOutBy: delivered.gateOutBy,
              departureDate: delivered.departureDate,
              departureTime: delivered.departureTime,
            };
          }
        }
      }

      return NextResponse.json({
        options: sorted.slice(0, take),
        source: "combined",
        ...(alreadyDeliveredInfo ? { alreadyDeliveredInfo } : {}),
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

    if (field === "driverNIC" || field === "driverName") {
      // Filters the driver list to whichever Carrier is currently selected on the form —
      // resolved either from an already-known CarrierOption id (the post-approval
      // Change Driver / Carrier screen) or from a raw registration no. string (the LT/CD/
      // After Sales creation forms, which only hold free-text Carrier fields in state).
      // Falls back to the full unfiltered list when the carrier isn't resolvable, so an
      // unmapped/new carrier never results in a dead-end empty dropdown.
      let carrierIdFilter = searchParams.get("carrierId") ?? undefined;
      const carrierRegNoParam = searchParams.get("carrierRegNo") ?? undefined;
      if (!carrierIdFilter && carrierRegNoParam) {
        const resolvedCarrier = await prisma.carrierOption.findUnique({ where: { registrationNo: carrierRegNoParam } });
        if (resolvedCarrier) carrierIdFilter = resolvedCarrier.id;
      }

      const drivers = await (prisma as any).driverOption.findMany({
        where: {
          ...(q ? { OR: [{ nic: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
          ...(carrierIdFilter ? { carrierId: carrierIdFilter } : {}),
        },
        orderBy: field === "driverNIC" ? { nic: "asc" } : { name: "asc" },
        take,
      });
      return NextResponse.json({
        options: drivers.map((d: { id: string; name: string; nic: string; contact: string | null; licenceNo: string | null }) =>
          field === "driverNIC"
            ? { id: d.id, value: d.nic, label: `${d.nic} — ${d.name}`, driverName: d.name, driverContact: d.contact ?? "", driverLicenceNo: d.licenceNo ?? "" }
            : { id: d.id, value: d.name, label: `${d.name} (${d.nic})`, driverNIC: d.nic, driverContact: d.contact ?? "", driverLicenceNo: d.licenceNo ?? "" }
        ),
      });
    }

    const options = await prisma.user.findMany({
      where: {
        role: approverLookupRole as any,
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
    const licenceNo = normalize(body.licenceNo ?? "");
    const contact = normalize(body.contact ?? "") || null;
    const carrierId = normalize(body.carrierId ?? "") || null;
    if (!name || !nic || !licenceNo) {
      return NextResponse.json({ error: "Name, NIC, and Driving Licence No. are all required." }, { status: 400 });
    }
    if (!carrierId) {
      return NextResponse.json({ error: "A driver must be assigned to a Carrier Company." }, { status: 400 });
    }
    if (!isValidNIC(nic)) {
      return NextResponse.json({ error: "Invalid NIC format (e.g. 123456789V or 200012345678)." }, { status: 400 });
    }
    if (!isValidLicenceNo(licenceNo)) {
      return NextResponse.json({ error: "Invalid Driving Licence No. format (e.g. B1234567 — 1 letter followed by 7 digits)." }, { status: 400 });
    }
    if (contact && !isValidPhone(contact)) {
      return NextResponse.json({ error: "Invalid contact number format." }, { status: 400 });
    }
    try {
      const [existingByNic, existingByLicence] = await Promise.all([
        (prisma as any).driverOption.findUnique({ where: { nic } }),
        (prisma as any).driverOption.findUnique({ where: { licenceNo } }),
      ]);
      if (existingByNic || existingByLicence) {
        return NextResponse.json({
          error: existingByNic
            ? `A driver with NIC ${nic} already exists (${existingByNic.name}).`
            : `A driver with Driving Licence No. ${licenceNo} already exists (${existingByLicence.name}).`,
        }, { status: 409 });
      }
      const created = await (prisma as any).driverOption.create({
        data: { name, nic, licenceNo, contact, carrierId },
      });
      return NextResponse.json({ option: { id: created.id, name: created.name, nic: created.nic, licenceNo: created.licenceNo, contact: created.contact, carrierId: created.carrierId } });
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
        colour: colour || null,
      },
      create: {
        vehicleNo,
        chassisNo: chassisNo || null,
        description: description || null,
        model: model || null,
        make: make || null,
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
        colour: created.colour ?? "",
        label: created.chassisNo ? `${created.vehicleNo} / ${created.chassisNo}` : created.vehicleNo,
      },
    });
  } catch (e) {
    console.error("Vehicle create error:", e);
    return NextResponse.json({ error: "Failed to create vehicle." }, { status: 500 });
  }
}
