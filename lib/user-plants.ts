import { prisma } from "@/lib/prisma";

export function plantPrefix(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized.split(" - ")[0].trim() : "";
}

// A user's full plant list: their primary `defaultLocation` plus any additional plants
// they've been mapped to. `defaultLocation` is always included so a user with no extra
// mappings resolves to exactly the same single plant as before this feature existed.
// Raw SQL throughout — never depends on the Prisma client having been regenerated after
// the schema change (matches the existing defensive style used elsewhere for new tables).
export async function getUserPlantPrefixes(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ defaultLocation: string | null }[]>`
    SELECT "defaultLocation" FROM "User" WHERE id = ${userId}
  `;
  if (rows.length === 0) return [];

  const mappings = await prisma.$queryRaw<{ plantName: string }[]>`
    SELECT "plantName" FROM "UserPlantMapping" WHERE "userId" = ${userId}
  `.catch(() => [] as { plantName: string }[]);

  const plants = new Set<string>();
  const primary = plantPrefix(rows[0].defaultLocation);
  if (primary) plants.add(primary);
  for (const m of mappings) {
    const p = plantPrefix(m.plantName);
    if (p) plants.add(p);
  }
  return [...plants];
}

// Prisma `OR` clause matching any of a user's mapped plants against a given field
// (e.g. "defaultLocation", "fromLocation", "toLocation") via the same startsWith-prefix
// convention already used everywhere for single-plant matching.
export function plantsWhereOr(field: string, plants: string[]) {
  return plants.map((p) => ({ [field]: { startsWith: p, mode: "insensitive" as const } }));
}

// For "who do I notify at plant X" lookups: returns the ids of users (of the given role)
// who have `plant` among their ADDITIONAL mapped plants (UserPlantMapping only — not
// defaultLocation, which every existing call site already queries itself). Meant to be
// OR'd into each site's existing defaultLocation-based query as a pure addition, so every
// site's own fallback/matching nuance (contains vs startsWith, fallback-to-all, etc.)
// is left completely untouched — this only ever adds more matches, never removes any.
export async function findExtraMappedUserIds(role: string, plant: string | null | undefined): Promise<string[]> {
  const p = plantPrefix(plant);
  if (!p) return [];
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT upm."userId" FROM "UserPlantMapping" upm
    JOIN "User" u ON u.id = upm."userId"
    WHERE u.role = ${role}::"Role" AND upm."plantName" ILIKE ${p + "%"}
  `.catch(() => [] as { userId: string }[]);
  return rows.map((r) => r.userId);
}
