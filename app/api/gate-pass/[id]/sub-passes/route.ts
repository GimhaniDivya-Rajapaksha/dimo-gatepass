import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function withJourneyNumber<T extends { passType?: string | null; gatePassNumber: string; parentPass?: { gatePassNumber: string } | null }>(pass: T): T {
  if (pass.passType === "AFTER_SALES" && pass.parentPass?.gatePassNumber) {
    return { ...pass, gatePassNumber: pass.parentPass.gatePassNumber };
  }
  return pass;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pass = await prisma.gatePass.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      subPasses: {
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      parentPass: { select: { id: true, gatePassNumber: true, passSubType: true, status: true, toLocation: true } },
    },
  });

  if (!pass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // escalationRejectionReason (and escalationApproved) were added after the last prisma generate —
  // read them via raw SQL so the rejection banner always shows to the initiator.
  let escalationExtra: { escalationRejectionReason: string | null; escalationApproved: boolean } = {
    escalationRejectionReason: null,
    escalationApproved: false,
  };
  try {
    const rows: { escalationRejectionReason: string | null; escalationApproved: boolean }[] =
      await prisma.$queryRaw`SELECT "escalationRejectionReason", "escalationApproved" FROM "GatePass" WHERE id = ${pass.id} LIMIT 1`;
    if (rows[0]) escalationExtra = rows[0];
  } catch { /* columns may not exist on older deployments */ }

  return NextResponse.json({
    pass: withJourneyNumber({
      ...pass,
      ...escalationExtra,
      subPasses: pass.subPasses.map((subPass) => withJourneyNumber(subPass)),
    }),
  });
}
