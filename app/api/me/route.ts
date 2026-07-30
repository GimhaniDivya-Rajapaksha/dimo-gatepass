import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { plantPrefix } from "@/lib/user-plants";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma.user.findUnique as any)({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      role: true,
      defaultLocation: true,
      approver: { select: { id: true, name: true } },
      backupApprover: { select: { id: true, name: true } },
    },
  });

  // Additional mapped plants (beyond the primary defaultLocation) — raw SQL so this
  // never depends on the Prisma client having been regenerated after the schema change.
  const mappedPlants = user
    ? await prisma.$queryRaw<{ plantName: string }[]>`
        SELECT "plantName" FROM "UserPlantMapping" WHERE "userId" = ${session.user.id}
      `.catch(() => [] as { plantName: string }[])
    : [];
  const allPlants = [...new Set([plantPrefix(user?.defaultLocation), ...mappedPlants.map((m) => plantPrefix(m.plantName))].filter(Boolean))];

  return NextResponse.json({ user, mappedPlants: allPlants });
}
