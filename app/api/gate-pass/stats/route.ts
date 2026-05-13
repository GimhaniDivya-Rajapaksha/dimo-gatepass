import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Same rank table as collapseJourneyRows on the client — higher = more active/urgent
const STATUS_RANK: Record<string, number> = {
  PENDING_APPROVAL: 8,
  CASHIER_REVIEW:   7,
  APPROVED:         6,
  INITIATOR_OUT:    5,
  INITIATOR_IN:     5,
  GATE_OUT:         4,
  COMPLETED:        3,
  REJECTED:         2,
  CANCELLED:        1,
  DRAFT:            0,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  const userId = session.user.id;

  // Only count passes that BELONG to this user (created by them, or sub-passes
  // of journeys they started). Vehicle arrivals from other initiators are shown
  // in a separate dashboard section and must NOT inflate these stat cards.
  let scopeWhere: Record<string, unknown> = {};

  if (role === "INITIATOR" || role === "SERVICE_ADVISOR") {
    scopeWhere = {
      OR: [
        { createdById: userId },
        { parentPass: { createdById: userId } }, // sub-passes of their AFTER_SALES journeys
      ],
    };
  } else if (role === "AREA_SALES_OFFICER") {
    scopeWhere = {
      OR: [
        { createdById: userId },
        { parentPass: { createdById: userId } },
      ],
    };
  } else if (role === "APPROVER") {
    // Passes assigned to this approver for review
    scopeWhere = { approverId: userId };
  }
  // CASHIER, SECURITY_OFFICER, ADMIN → all passes

  try {
    const all = await prisma.gatePass.findMany({
      where: scopeWhere,
      select: {
        gatePassNumber: true,
        passType: true,
        passSubType: true,
        status: true,
        parentPass: { select: { gatePassNumber: true } },
      },
    });

    // Collapse to one entry per JOURNEY — for AFTER_SALES all legs share a
    // journey number; we keep only the most-active (highest rank) status.
    const journeyStatus = new Map<string, string>();

    for (const pass of all) {
      // AFTER_SALES: group all legs by the ROOT journey's gatePassNumber
      const journeyKey = pass.passType === "AFTER_SALES"
        ? `as:${pass.parentPass?.gatePassNumber ?? pass.gatePassNumber}`
        : `lt:${pass.gatePassNumber}`;

      const existing = journeyStatus.get(journeyKey);
      if (!existing || (STATUS_RANK[pass.status] ?? 0) > (STATUS_RANK[existing] ?? 0)) {
        journeyStatus.set(journeyKey, pass.status);
      }
    }

    // Count journeys by their current (most-active) status
    const counts: Record<string, number> = {};
    for (const status of journeyStatus.values()) {
      counts[status] = (counts[status] ?? 0) + 1;
    }

    const pending       = counts["PENDING_APPROVAL"] ?? 0;
    const cashierReview = counts["CASHIER_REVIEW"]   ?? 0;
    const approved      = counts["APPROVED"]         ?? 0;
    const rejected      = counts["REJECTED"]         ?? 0;
    const gateOut       = counts["GATE_OUT"]         ?? 0;
    const completed     = counts["COMPLETED"]        ?? 0;
    const cancelled     = counts["CANCELLED"]        ?? 0;

    return NextResponse.json({
      pending, cashierReview, approved, rejected, gateOut, completed, cancelled,
      total: pending + cashierReview + approved + rejected + gateOut + completed + cancelled,
    }, { headers: { "Cache-Control": "private, max-age=30" } });

  } catch (e) {
    console.error("Stats error:", e);
    return NextResponse.json(
      { pending: 0, cashierReview: 0, approved: 0, rejected: 0, gateOut: 0, completed: 0, cancelled: 0, total: 0 },
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}
