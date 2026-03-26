import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  try {
    const [users, passes] = await Promise.all([
      (prisma.user as any).findMany({ select: { defaultLocation: true }, where: { defaultLocation: { not: null } } }),
      prisma.gatePass.findMany({ select: { fromLocation: true, toLocation: true } }),
    ]);

    const set = new Set<string>();
    users.forEach((u: any) => { if (u.defaultLocation) set.add(u.defaultLocation); });
    passes.forEach((p: any) => {
      if (p.fromLocation) set.add(p.fromLocation);
      if (p.toLocation) set.add(p.toLocation);
    });

    const locations = [...set].filter(Boolean).sort();
    return NextResponse.json({ locations });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ locations: [] });
  }
}
