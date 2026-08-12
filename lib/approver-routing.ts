import { prisma } from "@/lib/prisma";
import { findExtraMappedUserIds } from "@/lib/user-plants";

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
  if (!requiredBrand) return true; // vehicle has no known brand → all approvers match
  if (!userBrand?.trim()) return true; // approver has no brand restriction → matches all vehicles

  const requiredAliases = BRAND_ALIASES[requiredBrand] ?? [requiredBrand];
  return splitBrands(userBrand).some((brand) => {
    const approverBrand = normalizeText(brand);
    return requiredAliases.some((alias) => approverBrand === normalizeText(alias));
  });
}

export async function findApproversForLocationBrand(
  location: string | null,
  selectedApproverName?: string,
  vehicleMake?: string | null,
  // Defaults to "APPROVER" so every existing caller's behavior is completely unchanged.
  // Pass "SPECIAL_APPROVER" when routing a pass created by an Approver (Approver-initiated
  // gate passes must only ever route to their Special Approver, never a normal Approver).
  targetRole: "APPROVER" | "SPECIAL_APPROVER" = "APPROVER"
) {
  // Match approvers by plant prefix (first part before " - ") so sub-storage variants
  // like "Galle Branch - HNB" and "Galle Branch - Sales" both resolve to "Galle Branch" approvers.
  // Also matches approvers who have this plant among their ADDITIONAL mapped plants
  // (UserPlantMapping), not just their primary defaultLocation.
  const plantPrefix = location ? location.split(" - ")[0].trim() : null;
  const extraApproverIds = plantPrefix ? await findExtraMappedUserIds(targetRole, plantPrefix) : [];
  const baseWhere = plantPrefix
    ? {
        role: targetRole,
        OR: [
          { defaultLocation: { startsWith: plantPrefix, mode: "insensitive" as const } },
          ...(extraApproverIds.length > 0 ? [{ id: { in: extraApproverIds } }] : []),
        ],
      }
    : { role: targetRole };

  const findUsers = (where: object) =>
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, brand: true, defaultLocation: true },
    }) as Promise<ApproverUser[]>;

  const selectedName = selectedApproverName?.trim();
  const hasVehicleBrand = Boolean(canonicalVehicleBrand(vehicleMake));

  if (selectedName) {
    // Honor the explicit name selection regardless of location — only fall through to
    // location-based routing if no approver with that name exists at all.
    const exact = (await findUsers({
      role: targetRole,
      name: { equals: selectedName, mode: "insensitive" },
    })).filter((approver) => brandMatches(approver.brand, vehicleMake));
    if (exact.length > 0) return exact;
  }

  const sameLocation = await findUsers(baseWhere);
  const sameLocationBrand = sameLocation.filter((approver) => brandMatches(approver.brand, vehicleMake));
  if (sameLocationBrand.length > 0) return sameLocationBrand;

  if (hasVehicleBrand) {
    const sameBrand = (await findUsers({ role: targetRole })).filter((approver) => brandMatches(approver.brand, vehicleMake));
    if (sameBrand.length > 0) return sameBrand;
    // No brand-matched approver found anywhere — fall back to location approvers
    if (sameLocation.length > 0) return sameLocation;
  }

  if (sameLocation.length > 0) return sameLocation;
  return findUsers({ role: targetRole });
}
