import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role as string;
  const userId = session.user.id as string;
  const userName = (session.user as { name?: string | null }).name ?? "";
  const defaultLocation = (session.user as { defaultLocation?: string | null }).defaultLocation ?? null;
  const plantPrefix = defaultLocation ? defaultLocation.split(" - ")[0].trim() : null;

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
      if (plantPrefix) {
        orClauses.push({
          securityCreated: true,
          status: { not: "DRAFT" },
          createdBy: { defaultLocation: { startsWith: plantPrefix } },
        });
      }
      if (defaultLocation) {
        orClauses.push({
          passType: "AFTER_SALES",
          passSubType: "SUB_OUT",
          toLocation: { equals: defaultLocation, mode: "insensitive" as const },
          status: "COMPLETED",
        });
      }

      myPasses  = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }] } as any });
      pending   = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "PENDING_APPROVAL" }] } as any });
      rejected  = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "REJECTED"         }] } as any });
      completed = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "COMPLETED"        }] } as any });

      // Vehicle Arrivals: call the exact same API endpoints the receive page uses so
      // the count ALWAYS matches what the page shows (locationView=true bypasses own-passes filter).
      // toLocationCode filters server-side by the code part of the location string (after " - ").
      const ltParams = new URLSearchParams({ passType: "LOCATION_TRANSFER", status: "GATE_OUT", limit: "1", locationView: "true" });
      const asParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", status: "GATE_OUT", limit: "1", locationView: "true" });
      if (defaultLocation) {
        const myCode = defaultLocation.split(" - ").slice(1).join(" - ").trim();
        if (myCode) {
          ltParams.set("toLocationCode", myCode);
          asParams.set("toLocationCode", myCode);
        } else if (plantPrefix) {
          ltParams.set("toLocationPlant", plantPrefix);
          asParams.set("toLocationPlant", plantPrefix);
        }
      }
      const ltRes = await fetch(`${origin}/api/gate-pass?${ltParams}`, { headers: { cookie } });
      const ltData = ltRes.ok ? await ltRes.json() : { total: 0 };
      const asRes = await fetch(`${origin}/api/gate-pass?${asParams}`, { headers: { cookie } });
      const asData = asRes.ok ? await asRes.json() : { total: 0 };
      arrivals = (ltData.total ?? 0) + (asData.total ?? 0);

    } else if (role === "AREA_SALES_OFFICER") {
      const orClauses: object[] = [
        { createdById: userId },
        { parentPass: { createdById: userId } },
      ];
      if (plantPrefix) {
        orClauses.push({ passType: "AFTER_SALES", toLocation: { startsWith: plantPrefix, mode: "insensitive" as const } });
        orClauses.push({ passType: "AFTER_SALES", fromLocation: { startsWith: plantPrefix, mode: "insensitive" as const } });
        orClauses.push({ passType: "LOCATION_TRANSFER", toLocation: { startsWith: plantPrefix, mode: "insensitive" as const }, status: "COMPLETED" });
      }
      myPasses  = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }] } as any });
      pending   = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "PENDING_APPROVAL" }] } as any });
      completed = await prisma.gatePass.count({ where: { AND: [{ OR: orClauses }, { status: "COMPLETED"        }] } as any });

    } else if (role === "APPROVER") {
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
      if (plantPrefix) {
        const locationOr = {
          OR: [
            { fromLocation: { startsWith: plantPrefix, mode: "insensitive" as const } },
            { toLocation:   { startsWith: plantPrefix, mode: "insensitive" as const } },
          ],
        };
        pending   = await prisma.gatePass.count({ where: { AND: [locationOr, { status: "PENDING_APPROVAL" }] } as any });
        completed = await prisma.gatePass.count({ where: { AND: [locationOr, { status: "COMPLETED"       }] } as any });
      }
    } else if (role === "CASHIER") {
      if (plantPrefix) {
        const cashierFilter = { fromLocation: { startsWith: plantPrefix, mode: "insensitive" as const } };
        pending   = await prisma.gatePass.count({ where: { AND: [cashierFilter, { status: "CASHIER_REVIEW" }] } as any });
        completed = await prisma.gatePass.count({ where: { AND: [cashierFilter, { status: "COMPLETED"      }] } as any });
      }
    }

    return NextResponse.json({ myPasses, pending, rejected, arrivals, completed });
  } catch {
    return NextResponse.json({ myPasses: 0, pending: 0, rejected: 0, arrivals: 0, completed: 0 });
  }
}
