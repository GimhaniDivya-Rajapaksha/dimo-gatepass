import { prisma } from "@/lib/prisma";

type ApproverUser = {
  id: string;
  name: string;
  email: string;
  brand: string | null;
  defaultLocation: string | null;
};

const BRAND_ALIASES: Record<string, string[]> = {
  "Mercedes-Benz": ["mercedes-benz", "mercedes benz", "mercedes", "benz", "mb"],
  TATA: ["tata"],
  Jeep: ["jeep"],
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function splitBrands(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((brand) => brand.trim())
    .filter(Boolean);
}

function canonicalVehicleBrand(make: string | null | undefined) {
  const normalized = normalizeText(make);
  if (!normalized) return "";

  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
      return brand;
    }
  }

  return make?.trim() ?? "";
}

function brandMatches(userBrand: string | null | undefined, vehicleMake: string | null | undefined) {
  const requiredBrand = canonicalVehicleBrand(vehicleMake);
  if (!requiredBrand) return true;

  const requiredAliases = BRAND_ALIASES[requiredBrand] ?? [requiredBrand];
  return splitBrands(userBrand).some((brand) => {
    const approverBrand = normalizeText(brand);
    return requiredAliases.some((alias) => approverBrand === normalizeText(alias));
  });
}

export async function findApproversForLocationBrand(
  location: string | null,
  selectedApproverName?: string,
  vehicleMake?: string | null
) {
  // Match approvers by plant prefix (first part before " - ") so sub-storage variants
  // like "Galle Branch - HNB" and "Galle Branch - Sales" both resolve to "Galle Branch" approvers.
  const plantPrefix = location ? location.split(" - ")[0].trim() : null;
  const baseWhere = plantPrefix
    ? { role: "APPROVER" as const, defaultLocation: { startsWith: plantPrefix, mode: "insensitive" as const } }
    : { role: "APPROVER" as const };

  const findUsers = (where: object) =>
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, brand: true, defaultLocation: true },
    }) as Promise<ApproverUser[]>;

  const selectedName = selectedApproverName?.trim();
  const hasVehicleBrand = Boolean(canonicalVehicleBrand(vehicleMake));

  if (selectedName) {
    const exact = (await findUsers({
      ...baseWhere,
      name: { equals: selectedName, mode: "insensitive" },
    })).filter((approver) => brandMatches(approver.brand, vehicleMake));
    if (exact.length > 0) return exact;
  }

  const sameLocation = await findUsers(baseWhere);
  const sameLocationBrand = sameLocation.filter((approver) => brandMatches(approver.brand, vehicleMake));
  if (sameLocationBrand.length > 0) return sameLocationBrand;

  if (hasVehicleBrand) {
    const sameBrand = (await findUsers({ role: "APPROVER" })).filter((approver) => brandMatches(approver.brand, vehicleMake));
    if (sameBrand.length > 0) return sameBrand;
    return [];
  }

  if (sameLocation.length > 0) return sameLocation;
  return findUsers({ role: "APPROVER" });
}
