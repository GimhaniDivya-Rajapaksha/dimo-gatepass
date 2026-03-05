import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  // INITIATOR only sees their own passes
  const baseWhere = role === "INITIATOR" ? { createdById: session.user.id } : {};

  try {
    const [pending, approved, rejected, gateOut, completed] = await Promise.all([
      prisma.gatePass.count({ where: { ...baseWhere, status: "PENDING_APPROVAL" } }),
      prisma.gatePass.count({ where: { ...baseWhere, status: "APPROVED" } }),
      prisma.gatePass.count({ where: { ...baseWhere, status: "REJECTED" } }),
      prisma.gatePass.count({ where: { ...baseWhere, status: "GATE_OUT" } }),
      prisma.gatePass.count({ where: { ...baseWhere, status: "COMPLETED" } }),
    ]);

    return NextResponse.json({
      pending,
      approved,
      rejected,
      gateOut,
      completed,
      total: pending + approved + rejected + gateOut + completed,
    });
  } catch (e) {
    console.error("Stats error:", e);
    return NextResponse.json({ pending: 0, approved: 0, rejected: 0, gateOut: 0, completed: 0, total: 0 });
  }
}
