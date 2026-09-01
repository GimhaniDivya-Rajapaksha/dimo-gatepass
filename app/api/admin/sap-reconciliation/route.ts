import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ELIGIBILITY_LABEL, type SapEligibility } from "@/lib/sap-reconciliation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

type ReconRow = {
  id: string;
  gatePassId: string;
  ltCompletedAt: Date;
  mmstaAtCompletion: string;
  sdstaAtCompletion: string;
  latestMmsta: string | null;
  latestSdsta: string | null;
  eligibility: SapEligibility;
  lastCheckedAt: Date | null;
  writtenAt: Date | null;
  writtenById: string | null;
};

export async function fetchReconciliationRows(params: { eligibility?: string; from?: string; to?: string }) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.eligibility && params.eligibility !== "ALL") {
    conditions.push(`"eligibility" = $${values.length + 1}`);
    values.push(params.eligibility);
  }
  if (params.from) {
    conditions.push(`"ltCompletedAt" >= $${values.length + 1}`);
    values.push(new Date(params.from));
  }
  if (params.to) {
    conditions.push(`"ltCompletedAt" <= $${values.length + 1}`);
    values.push(new Date(params.to));
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await prisma.$queryRawUnsafe<ReconRow[]>(
    `SELECT "id", "gatePassId", "ltCompletedAt", "mmstaAtCompletion", "sdstaAtCompletion", "latestMmsta", "latestSdsta", "eligibility", "lastCheckedAt", "writtenAt", "writtenById"
     FROM "SapReconciliation" ${where} ORDER BY "ltCompletedAt" DESC`,
    ...values
  ).catch(() => [] as ReconRow[]);

  if (rows.length === 0) return [];

  const gatePassIds = rows.map((r) => r.gatePassId);
  const writtenByIds = [...new Set(rows.map((r) => r.writtenById).filter((v): v is string => !!v))];

  const [gatePasses, writers] = await Promise.all([
    prisma.gatePass.findMany({
      where: { id: { in: gatePassIds } },
      select: {
        id: true, gatePassNumber: true, vehicle: true, fromLocation: true, toLocation: true,
        createdBy: { select: { name: true, email: true } },
      },
    }),
    writtenByIds.length
      ? prisma.user.findMany({ where: { id: { in: writtenByIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const gpMap = new Map(gatePasses.map((g) => [g.id, g]));
  const writerMap = new Map(writers.map((w) => [w.id, w.name]));

  return rows.map((r) => {
    const gp = gpMap.get(r.gatePassId);
    return {
      id: r.id,
      gatePassId: r.gatePassId,
      gatePassNumber: gp?.gatePassNumber ?? "—",
      vehicle: gp?.vehicle ?? "—",
      initiatorName: gp?.createdBy.name ?? "—",
      initiatorEmail: gp?.createdBy.email ?? "",
      fromLocation: gp?.fromLocation ?? "",
      toLocation: gp?.toLocation ?? "",
      ltCompletedAt: r.ltCompletedAt,
      mmstaAtCompletion: r.mmstaAtCompletion,
      sdstaAtCompletion: r.sdstaAtCompletion,
      latestMmsta: r.latestMmsta,
      latestSdsta: r.latestSdsta,
      eligibility: r.eligibility,
      eligibilityLabel: ELIGIBILITY_LABEL[r.eligibility] ?? r.eligibility,
      lastCheckedAt: r.lastCheckedAt,
      writtenAt: r.writtenAt,
      writtenByName: r.writtenById ? (writerMap.get(r.writtenById) ?? "—") : null,
    };
  });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const data = await fetchReconciliationRows({
    eligibility: searchParams.get("eligibility") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  return NextResponse.json({ data });
}
