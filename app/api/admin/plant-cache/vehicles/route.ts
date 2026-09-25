import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listPlantCacheForAdmin } from "@/lib/plant-cache";

// Admin-only, read-only — lets an admin see actual cache content (not just counts) while
// testing the Plant/Material Cache feature locally. Never called from any live search/lookup.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const take = parseInt(searchParams.get("take") ?? "50", 10);

  const { rows, total } = await listPlantCacheForAdmin({ q, take: Number.isFinite(take) ? take : 50 });
  return NextResponse.json({ rows, total });
}
