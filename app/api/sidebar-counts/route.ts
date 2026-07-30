import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isApproverRole } from "@/lib/roles";
import { getUserPlantPrefixes, plantsWhereOr } from "@/lib/user-plants";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role as string;
  const userId = session.user.id as string;
  const userName = (session.user as { name?: string | null }).name ?? "";
  const myPlants = await getUserPlantPrefixes(userId);

  // Cookie forwarding for internal API calls (keeps session auth intact)
  const cookie = req.headers.get("cookie") ?? "";
  const origin = req.nextUrl.origin;

  try {
    let myPasses = 0;
    let pending = 0;
    let rejected = 0;
    let arrivals = 0;
    let completed = 0;

    if (role === "INITIATOR" || role === "SERVICE_ADVISOR") {
      // Mirror the exact ownership OR-clauses used in GET /api/gate-pass for INITIATOR
      const orClauses: object[] = [
        { createdById: userId },
        { parentPass: { createdById: userId } },
      ];
      for (const plant of myPlants) {
        orClauses.push({
          securityCreated: true,
          status: { not: "DRAFT" },
          createdBy: { defaultLocation: { startsWith: plant } },
        });
      }
      for (const plant of myPlants) {
        orClauses.push({
          passType: "AFTER_SALES",
          passSubType: "SUB_OUT",
          toLocation: { startsWith: plant, mode: "insensitive" as const },
          status: "COMPLETED",
        });
      }

      myPasses  = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }] } as any });
      pending   = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "PENDING_APPROVAL" }] } as any });
      rejected  = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "REJECTED"         }] } as any });
      completed = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "COMPLETED"        }] } as any });

      // Vehicle Arrivals: call the exact same API endpoints the receive page uses so
      // the count ALWAYS matches what the page shows. locationView=true bypasses the
      // own-passes filter AND tells the server to resolve the caller's mapped plants
      // itself (see /api/gate-pass) — no plant params need to be sent from here.
      const ltParams = new URLSearchParams({ passType: "LOCATION_TRANSFER", status: "GATE_OUT", limit: "1", locationView: "true" });
      const asParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", status: "GATE_OUT", limit: "1", locationView: "true" });
      const tdParams = new URLSearchParams({ passType: "TEST_DRIVE", status: "GATE_OUT", limit: "1", locationView: "true" });
      const ltRes = await fetch(`${origin}/api/gate-pass?${ltParams}`, { headers: { cookie } });
      const ltData = ltRes.ok ? await ltRes.json() : { total: 0 };
      const asRes = await fetch(`${origin}/api/gate-pass?${asParams}`, { headers: { cookie } });
      const asData = asRes.ok ? await asRes.json() : { total: 0 };
      const tdRes = await fetch(`${origin}/api/gate-pass?${tdParams}`, { headers: { cookie } });
      const tdData = tdRes.ok ? await tdRes.json() : { total: 0 };
      arrivals = (ltData.total ?? 0) + (asData.total ?? 0) + (tdData.total ?? 0);

    } else if (role === "AREA_SALES_OFFICER") {
      const orClauses: object[] = [
        { createdById: userId },
        { parentPass: { createdById: userId } },
      ];
      for (const plant of myPlants) {
        const loc = { startsWith: plant, mode: "insensitive" as const };
        orClauses.push({ passType: "AFTER_SALES", toLocation: loc });
        orClauses.push({ passType: "AFTER_SALES", fromLocation: loc });
        orClauses.push({ passType: "LOCATION_TRANSFER", toLocation: loc, status: "COMPLETED" });
      }
      myPasses  = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }] } as any });
      pending   = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "PENDING_APPROVAL" }] } as any });
      completed = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "COMPLETED"        }] } as any });

    } else if (isApproverRole(role)) {
      // Mirror APPROVER pending logic: assigned by name OR intendedApprover null + CASHIER_REVIEW credit passes
      const approverMatch = userName
        ? { OR: [
            { intendedApprover: { equals: userName, mode: "insensitive" as const } },
            { intendedApprover: null },
          ] }
        : {};
      pending = await prisma.gatePass.count({
        where: {
          AND: [
            approverMatch,
            { OR: [
              { status: "PENDING_APPROVAL" },
              { AND: [{ status: "CASHIER_REVIEW" }, { hasCredit: true }, { creditApproved: false }, { creditRejected: false }] },
            ]},
          ],
        } as any,
      });
      // Also count CD single-order escalations directed at this specific approver (by user ID)
      try {
        const cdEscalated: { count: bigint }[] = await prisma.$queryRaw`
          SELECT COUNT(*)::bigint AS count FROM "GatePass"
          WHERE status = 'CASHIER_REVIEW'
          AND "singleOrderEscalated" = true
          AND "singleOrderEscalatedApproverId" = ${userId}
        `;
        pending += Number(cdEscalated[0]?.count ?? 0);
      } catch { /* column may not exist on this deployment */ }
      completed = await prisma.gatePass.count({ where: { status: "COMPLETED" } as any });

    } else if (role === "DELIVERY_COORDINATOR") {
      if (myPlants.length > 0) {
        const locationOr = { OR: [...plantsWhereOr("fromLocation", myPlants), ...plantsWhereOr("toLocation", myPlants)] };
        pending   = await prisma.gatePass.count({ where: { AND: [locationOr, { status: "PENDING_APPROVAL" }] } as any });
        completed = await prisma.gatePass.count({ where: { AND: [locationOr, { status: "COMPLETED"       }] } as any });
      }
    } else if (role === "CASHIER") {
      if (myPlants.length > 0) {
        const cashierFilter = { OR: plantsWhereOr("fromLocation", myPlants) };
        pending   = await prisma.gatePass.count({ where: { AND: [cashierFilter, { status: "CASHIER_REVIEW" }] } as any });
        completed = await prisma.gatePass.count({ where: { AND: [cashierFilter, { status: "COMPLETED"      }] } as any });
      }
    }

    return NextResponse.json({ myPasses, pending, rejected, arrivals, completed });
  } catch {
    return NextResponse.json({ myPasses: 0, pending: 0, rejected: 0, arrivals: 0, completed: 0 });
  }
}
