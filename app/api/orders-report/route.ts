import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const IMMEDIATE_TERMS = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction"];

function classifyPayTerm(payTerm: string): "immediate" | "credit" {
  const t = (payTerm || "").toLowerCase().trim();
  if (t === "" || IMMEDIATE_TERMS.includes(t)) return "immediate";
  return "credit";
}

// GET /api/orders-report — vehicles with credit & immediate order breakdown
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = ["CASHIER", "APPROVER", "ADMIN", "INITIATOR", "AREA_SALES_OFFICER"];
  if (!allowed.includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter  = searchParams.get("status") || "";
  const searchFilter  = searchParams.get("search") || "";

  // Fetch all AFTER_SALES MAIN_OUT gate passes that have service orders
  const where: Record<string, unknown> = {
    passType: "AFTER_SALES",
    passSubType: "MAIN_OUT",
  };

  if (statusFilter) where.status = statusFilter;

  if (searchFilter) {
    where.OR = [
      { gatePassNumber: { contains: searchFilter, mode: "insensitive" } },
      { vehicle: { contains: searchFilter, mode: "insensitive" } },
      { chassis: { contains: searchFilter, mode: "insensitive" } },
    ];
  }

  const passes = await (prisma.gatePass as any).findMany({
    where,
    include: {
      serviceOrders: { orderBy: { createdAt: "asc" } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Shape the response
  const report = passes.map((p: any) => {
    const creditOrders   = p.serviceOrders.filter((o: any) => classifyPayTerm(o.payTerm) === "credit");
    const immediateOrders = p.serviceOrders.filter((o: any) => classifyPayTerm(o.payTerm) === "immediate");
    const hasOrders = p.serviceOrders.length > 0;
    return {
      id: p.id,
      gatePassNumber: p.gatePassNumber,
      vehicle: p.vehicle,
      chassis: p.chassis,
      make: p.make,
      status: p.status,
      hasCredit: p.hasCredit,
      hasImmediate: p.hasImmediate,
      cashierCleared: p.cashierCleared,
      creditApproved: p.creditApproved,
      hasOrders,
      creditOrders: creditOrders.map((o: any) => ({
        id: o.id, orderId: o.orderId, orderStatus: o.orderStatus, payTerm: o.payTerm, isAssigned: o.isAssigned,
        // payTerm stored as "HSTAT:<code>|<billingType>|<billingDate>"
        hstat: (o.payTerm || "").split("|")[0]?.replace("HSTAT:", "") || o.payTerm,
      })),
      immediateOrders: immediateOrders.map((o: any) => ({
        id: o.id, orderId: o.orderId, orderStatus: o.orderStatus, payTerm: o.payTerm, isAssigned: o.isAssigned,
        hstat: (o.payTerm || "").split("|")[0]?.replace("HSTAT:", "") || o.payTerm,
      })),
      creditCount: creditOrders.length,
      immediateCount: immediateOrders.length,
      totalOrders: p.serviceOrders.length,
      createdBy: p.createdBy,
      approvedBy: p.approvedBy,
      createdAt: p.createdAt,
      approvedAt: p.approvedAt,
      serviceJobNo: p.serviceJobNo,
    };
  });

  return NextResponse.json({ report });
}
