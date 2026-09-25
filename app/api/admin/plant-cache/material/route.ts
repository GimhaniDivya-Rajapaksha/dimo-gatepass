import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchAndCacheMaterial } from "@/lib/plant-cache";

// Admin-only — fetches one or more materials directly from SAP (Matnr filter) and caches the
// result. Accepts either { materialNo } for a single test call, or { materialNos: string[] }
// for a pasted/uploaded batch — same underlying per-material call either way, run one at a
// time so a single bad entry never aborts the rest.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const single = typeof body.materialNo === "string" ? [body.materialNo] : [];
  const batch = Array.isArray(body.materialNos) ? body.materialNos.filter((m: unknown): m is string => typeof m === "string") : [];
  const materialNos = [...new Set([...single, ...batch].map((m) => m.trim()).filter(Boolean))].slice(0, 500);

  if (materialNos.length === 0) {
    return NextResponse.json({ error: "No material number(s) provided." }, { status: 400 });
  }

  const results = [];
  for (const materialNo of materialNos) {
    results.push(await fetchAndCacheMaterial(materialNo));
  }

  return NextResponse.json({
    results,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
}
