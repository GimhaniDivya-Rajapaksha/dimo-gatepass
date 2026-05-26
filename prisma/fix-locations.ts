import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  // Find all passes where fromLocation or toLocation is a bare storage description (no " - ")
  const broken = await p.gatePass.findMany({
    where: {
      OR: [
        { fromLocation: { not: { contains: " - " } }, AND: { fromLocation: { not: null } } },
        { toLocation:   { not: { contains: " - " } }, AND: { toLocation:   { not: null } } },
      ],
    },
    select: { id: true, gatePassNumber: true, fromLocation: true, toLocation: true, createdBy: { select: { defaultLocation: true } } },
  });

  console.log(`Found ${broken.length} passes with bare/incomplete locations:`);
  broken.forEach(p => console.log(`  ${p.gatePassNumber}  from="${p.fromLocation}"  to="${p.toLocation}"  creatorLoc="${p.createdBy?.defaultLocation}"`));

  // Fix: replace bare "Vehicle Park-1" (or similar) with the creator's defaultLocation where we can infer it
  let fixed = 0;
  for (const pass of broken) {
    const creatorLoc = pass.createdBy?.defaultLocation;
    if (!creatorLoc || !creatorLoc.includes(" - ")) continue;

    const updates: Record<string, string> = {};
    if (pass.fromLocation && !pass.fromLocation.includes(" - ")) updates.fromLocation = creatorLoc;
    if (pass.toLocation   && !pass.toLocation.includes(" - "))   updates.toLocation   = creatorLoc;

    if (Object.keys(updates).length > 0) {
      await p.gatePass.update({ where: { id: pass.id }, data: updates });
      console.log(`  ✓ Fixed ${pass.gatePassNumber}:`, updates);
      fixed++;
    }
  }
  console.log(`\nFixed ${fixed} passes.`);
}

main().catch(console.error).finally(() => p.$disconnect());
