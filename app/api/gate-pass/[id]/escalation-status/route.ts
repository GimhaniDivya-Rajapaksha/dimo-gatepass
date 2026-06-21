import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Raw-SQL read of escalationApproved — bypasses stale Prisma client after schema migration
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows: { escalationApproved: boolean; escalationRejectionReason: string | null }[] =
    await prisma.$queryRaw`SELECT "escalationApproved", "escalationRejectionReason" FROM "GatePass" WHERE id = ${id} LIMIT 1`;

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    escalationApproved: rows[0].escalationApproved ?? false,
    escalationRejectionReason: rows[0].escalationRejectionReason ?? null,
  });
}
