import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlantLocationOptions, findPlantLocationOption, updateVehiclePlantLocation } from "@/lib/location-api";

function ciLocation(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? { equals: normalized, mode: "insensitive" as const } : undefined;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, rejectionReason, mismatch, mismatchNote, receivedChassis } = body;

  const gatePass = await (prisma.gatePass as any).findUnique({ where: { id } });
  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // APPROVER: approve credit portion of MAIN_OUT (parallel with cashier)
  if (action === "credit_approve") {
    if (session.user.role !== "APPROVER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.passSubType !== "MAIN_OUT") {
      return NextResponse.json({ error: "credit_approve only valid for MAIN_OUT" }, { status: 400 });
    }

    // Mark credit as approved
    await prisma.$executeRaw`UPDATE "GatePass" SET "creditApproved" = true, "approvedById" = ${session.user.id}, "approvedAt" = NOW() WHERE id = ${id}`;

    // Check if cashierCleared
    const updatedPass = await (prisma.gatePass as any).findUnique({ where: { id } });
    const cashierDone = updatedPass?.cashierCleared === true || updatedPass?.hasImmediate === false;

    if (cashierDone) {
      // Both done → APPROVED
      await prisma.gatePass.update({
        where: { id },
        data: { status: "APPROVED" },
      });

      // Notify pass creator
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_APPROVED",
          title: "All Checks Complete — Awaiting Security Gate Release",
          message: `Gate pass ${gatePass.gatePassNumber} — credit approved and payment cleared. Security Officer will confirm Gate OUT.`,
          gatePassId: gatePass.id,
        },
      });

      // Notify Security Officers
      const securityWhere = gatePass.fromLocation
        ? { role: "SECURITY_OFFICER" as any, defaultLocation: gatePass.fromLocation }
        : { role: "SECURITY_OFFICER" as any };
      const securityOfficers = await prisma.user.findMany({ where: securityWhere });
      if (securityOfficers.length > 0) {
        await prisma.notification.createMany({
          data: securityOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Vehicle Cleared — Ready for Gate OUT",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — credit approved & cash cleared. Please confirm gate release.`,
            gatePassId: gatePass.id,
          })),
        });
      }
      return NextResponse.json({ ok: true, status: "APPROVED" });
    } else {
      // Credit approved but waiting for cashier
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_SUBMITTED",
          title: "Credit Approved — Awaiting Cashier Clearance",
          message: `Gate pass ${gatePass.gatePassNumber} — credit orders approved. Waiting for cashier to clear immediate payment orders.`,
          gatePassId: gatePass.id,
        },
      });
      return NextResponse.json({ ok: true, status: "CASHIER_REVIEW" });
    }
  }

  // APPROVER: approve or reject
  if (action === "approve" || action === "reject") {
    if (session.user.role !== "APPROVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ── Standard approve / reject flow (LT, AFTER_SALES, CD-CREDIT) ──
    const newStatus = action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: newStatus,
        approvedById: session.user.id,
        approvedAt: new Date(),
        rejectionReason: action === "reject" ? (rejectionReason || null) : null,
      },
    });

    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: action === "approve" ? "GATE_PASS_APPROVED" : "GATE_PASS_REJECTED",
        title: action === "approve" ? "Gate Pass Approved" : "Gate Pass Rejected",
        message:
          action === "approve"
            ? `Your gate pass ${gatePass.gatePassNumber} has been approved.`
            : `Your gate pass ${gatePass.gatePassNumber} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
        gatePassId: gatePass.id,
      },
    });

    // Notify Security Officers at fromLocation when LT, MAIN_OUT, or CD-INVOICED is approved
    const needsSecurityNotify = (
      (action === "approve" && gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_OUT") ||
      (action === "approve" && gatePass.passType === "LOCATION_TRANSFER") ||
      (action === "approve" && gatePass.passType === "CUSTOMER_DELIVERY")
    );
    if (needsSecurityNotify) {
      const fromLoc = gatePass.fromLocation as string | null;
      const securityWhere = fromLoc
        ? { role: "SECURITY_OFFICER" as any, defaultLocation: fromLoc }
        : { role: "SECURITY_OFFICER" as any };
      const securityOfficers = await prisma.user.findMany({ where: securityWhere });
      if (securityOfficers.length > 0) {
        await prisma.notification.createMany({
          data: securityOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: gatePass.passType === "LOCATION_TRANSFER"
              ? "Location Transfer Approved — Confirm Gate OUT"
              : gatePass.passType === "CUSTOMER_DELIVERY"
              ? "Customer Delivery Approved — Confirm Gate OUT"
              : "Vehicle Cleared — Ready for Gate OUT",
            message: gatePass.passType === "LOCATION_TRANSFER"
              ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — LT approved, heading to ${gatePass.toLocation ?? "destination"}. Please confirm Gate OUT.`
              : gatePass.passType === "CUSTOMER_DELIVERY"
              ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — customer delivery approved. Please confirm Gate OUT.`
              : `${gatePass.gatePassNumber} (${gatePass.vehicle}) — credit approved. Please confirm gate release.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // CASHIER: clear payment for CD immediate pass
  if (action === "cashier_clear_cd") {
    const canClear = session.user.role === "CASHIER";
    if (!canClear) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.passType !== "CUSTOMER_DELIVERY") {
      return NextResponse.json({ error: "cashier_clear_cd only valid for Customer Delivery" }, { status: 400 });
    }
    if (gatePass.status !== "CASHIER_REVIEW" || !gatePass.hasImmediate) {
      return NextResponse.json({ error: "Pass not in cashier review state" }, { status: 400 });
    }

    await prisma.gatePass.update({
      where: { id },
      data: { status: "APPROVED", cashierCleared: true },
    });

    // Notify initiator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_APPROVED",
        title: "Payment Cleared — Vehicle Ready for Gate OUT",
        message: `Gate pass ${gatePass.gatePassNumber} — payment confirmed by ${session.user.role === "CASHIER" ? "Cashier" : "Approver"}. Security Officer will confirm Gate OUT.`,
        gatePassId: gatePass.id,
      },
    });

    // Notify Security Officers at fromLocation
    const fromLocCd = gatePass.fromLocation as string | null;
    const secWhereCd = fromLocCd
      ? { role: "SECURITY_OFFICER" as any, defaultLocation: fromLocCd }
      : { role: "SECURITY_OFFICER" as any };
    const secOfficersCd = await prisma.user.findMany({ where: secWhereCd });
    if (secOfficersCd.length > 0) {
      await prisma.notification.createMany({
        data: secOfficersCd.map((s: { id: string }) => ({
          userId: s.id,
          type: "GATE_PASS_APPROVED",
          title: "Customer Delivery Cleared — Confirm Gate OUT",
          message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — payment cleared. Customer delivery ready for Gate OUT.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    return NextResponse.json({ ok: true, status: "APPROVED" });
  }

  // INITIATOR: mark MAIN_IN as INITIATOR_IN (vehicle physically at gate, security to confirm entry)
  if (action === "initiator_gate_in") {
    if (session.user.role !== "INITIATOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.passType !== "AFTER_SALES" || gatePass.passSubType !== "MAIN_IN") {
      return NextResponse.json({ error: "Only MAIN_IN passes support this action" }, { status: 400 });
    }
    if (gatePass.status !== "APPROVED") {
      return NextResponse.json({ error: "Pass must be APPROVED before marking as IN" }, { status: 400 });
    }

    await prisma.gatePass.update({
      where: { id },
      data: { status: "INITIATOR_IN" as any },
    });

    // Notify Security Officers at toLocation (where the vehicle is arriving)
    const toLoc = gatePass.toLocation as string | null;
    const securityWhere = toLoc
      ? { role: "SECURITY_OFFICER" as any, defaultLocation: ciLocation(toLoc) }
      : { role: "SECURITY_OFFICER" as any };
    const securityOfficers = await prisma.user.findMany({ where: securityWhere });
    if (securityOfficers.length > 0) {
      await prisma.notification.createMany({
        data: securityOfficers.map((s: { id: string }) => ({
          userId: s.id,
          type: "GATE_PASS_APPROVED",
          title: "Incoming Vehicle — Confirm Gate IN",
          message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Initiator confirmed vehicle is at the gate. Please confirm Gate IN entry.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    return NextResponse.json({ ok: true, status: "INITIATOR_IN" });
  }

  // SECURITY_OFFICER: confirm Gate IN for GATE_OUT MAIN_IN / SUB_OUT_IN passes, APPROVED SUB_IN, or INITIATOR_IN MAIN_IN
  if (action === "security_gate_in") {
    if (session.user.role !== "SECURITY_OFFICER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const isMainIn   = gatePass.passSubType === "MAIN_IN";
    const isSubOut   = gatePass.passSubType === "SUB_OUT";
    const isSubOutIn = gatePass.passSubType === "SUB_OUT_IN";
    const isSubIn    = gatePass.passSubType === "SUB_IN";
    const isLT       = gatePass.passType === "LOCATION_TRANSFER";

    // SUB_IN: confirmed at APPROVED (Security B confirms vehicle entered ASO compound)
    // MAIN_IN: confirmed at APPROVED directly (no initiator step) or INITIATOR_IN (legacy) or GATE_OUT (legacy)
    // SUB_OUT: destination Security confirms Gate IN at GATE_OUT or INITIATOR_OUT status
    //   (INITIATOR_OUT = Initiator confirmed departure but no source SO processed Gate OUT)
    // Others: confirmed at GATE_OUT
    const validSubIn          = isSubIn && gatePass.passType === "AFTER_SALES" && gatePass.status === "APPROVED";
    const validApprovedMainIn = isMainIn && gatePass.passType === "AFTER_SALES" && gatePass.status === "APPROVED";
    const validGateOut        = gatePass.status === "GATE_OUT" && (isMainIn || isSubOut || isSubOutIn || isLT);
    const validInitiatorIn    = gatePass.status === "INITIATOR_IN" && isMainIn;
    if (!validSubIn && !validApprovedMainIn && !validGateOut && !validInitiatorIn) {
      return NextResponse.json({ error: "Not eligible for Security Gate IN confirmation" }, { status: 400 });
    }

    let liveLocationUpdate: { message: string; currentLocation: { label: string } } | null = null;
    let liveLocationUpdateError: string | null = null;

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "COMPLETED",
        ...(body.receivedChassis ? { chassis: body.receivedChassis } : {}),
        ...(body.mismatchNote ? { comments: `[MISMATCH] ${body.mismatchNote}` } : {}),
      },
    });

    const targetLabel = gatePass.toLocation as string | null;
    if ((isLT || isSubOut || isSubOutIn || validApprovedMainIn || validSubIn) && targetLabel) {
      try {
        const plantOptions = await fetchPlantLocationOptions().catch(() => []);
        let targetLocation = findPlantLocationOption(plantOptions, targetLabel);

        // SAP live options only include locations with vehicles currently parked there.
        // Fall back to the DB LocationOption table which covers all configured locations.
        if (!targetLocation) {
          const dbLocations = await prisma.locationOption.findMany();
          targetLocation = findPlantLocationOption(
            dbLocations.map((l) => ({
              plantCode: l.plantCode,
              plantDescription: l.plantDescription,
              storageLocation: l.storageLocation,
              storageDescription: l.storageDescription,
            })),
            targetLabel
          );
        }

        if (targetLocation) {
          liveLocationUpdate = await updateVehiclePlantLocation({
            identifiers: [
              gatePass.vehicle,
              body.receivedChassis,
              gatePass.chassis,
            ],
            destination: targetLocation,
            // SAP removes vehicles from /plant after a location transfer is processed.
            // Provide typed fallback identifiers so the update still works.
            sapFallback: {
              externalNo: gatePass.vehicle,
              chassisNo: body.receivedChassis || gatePass.chassis,
            },
          });
        } else {
          liveLocationUpdateError = `SAP location not found for "${targetLabel}" — vehicle location was not updated in SAP.`;
          console.warn("[security_gate_in] no matching SAP plant location for:", targetLabel);
        }
      } catch (error) {
        console.error("[security_gate_in] live location update failed:", error);
        liveLocationUpdateError = error instanceof Error ? error.message : "Vehicle location API update failed.";
      }
    }

    // Notify pass creator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_RECEIVED",
        title: isSubOut  ? "Vehicle Arrived at Sub-Location — Security Confirmed Gate IN"
          : isSubOutIn ? "Vehicle Returned — Security Confirmed Gate IN"
          : isSubIn    ? "Vehicle Received at Sub-Location — Security Confirmed"
          : isLT       ? "Vehicle Arrived at Destination — Security Confirmed Gate IN"
          : "Vehicle Arrived — Security Confirmed Gate IN",
        message: isSubOut
          ? `${gatePass.gatePassNumber} — Security Officer at ${gatePass.toLocation ?? "destination"} confirmed vehicle arrived at sub-location via Gate IN.`
          : isSubOutIn
          ? `${gatePass.gatePassNumber} — Security Officer confirmed vehicle returned to DIMO via Gate IN.`
          : isSubIn
          ? `${gatePass.gatePassNumber} — Security Officer confirmed vehicle has entered the sub-location compound.`
          : isLT
          ? `${gatePass.gatePassNumber} — Security Officer at ${gatePass.toLocation ?? "destination"} confirmed vehicle Gate IN. Transfer complete.`
          : `${gatePass.gatePassNumber} — Security Officer confirmed vehicle arrival at the gate.`,
        gatePassId: gatePass.id,
      },
    });

    // For SUB_IN: notify the Initiator who created the parent MAIN_IN pass
    if (isSubIn && gatePass.parentPassId) {
      const parentPass = await (prisma.gatePass as any).findUnique({
        where: { id: gatePass.parentPassId },
        select: { createdById: true },
      });
      if (parentPass?.createdById && parentPass.createdById !== gatePass.createdById) {
        await prisma.notification.create({
          data: {
            userId: parentPass.createdById,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Arrived at Sub-Location",
            message: `${gatePass.gatePassNumber} — Security Officer confirmed vehicle has entered the sub-location. ASO will return it when ready.`,
            gatePassId: gatePass.id,
          },
        });
      }
    }

    // For SUB_OUT: notify Initiators at the destination location (toLocation) — they receive the vehicle
    if (isSubOut) {
      const toLoc = gatePass.toLocation as string | null;
      if (toLoc) {
        const destInitiators = await prisma.user.findMany({
          where: { role: "INITIATOR", defaultLocation: ciLocation(toLoc) },
        });
        const destInitiatorsToNotify = destInitiators.filter((u) => u.id !== gatePass.createdById);
        if (destInitiatorsToNotify.length > 0) {
          await prisma.notification.createMany({
            data: destInitiatorsToNotify.map((u) => ({
              userId: u.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Arrived — Security Confirmed Gate IN",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Security Officer confirmed vehicle has arrived at ${toLoc}.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
    }

    // For SUB_OUT_IN: also notify the Initiator who created the original (parent) pass
    if (isSubOutIn && gatePass.parentPassId) {
      const parentPass = await (prisma.gatePass as any).findUnique({
        where: { id: gatePass.parentPassId },
        select: { createdById: true },
      });
      if (parentPass?.createdById && parentPass.createdById !== gatePass.createdById) {
        await prisma.notification.create({
          data: {
            userId: parentPass.createdById,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Returned — Security Confirmed Gate IN",
            message: `${gatePass.gatePassNumber} — Vehicle has returned to DIMO. Security Officer confirmed Gate IN.`,
            gatePassId: gatePass.id,
          },
        });
      }
    }

    return NextResponse.json({
      gatePass: updated,
      liveLocationUpdate,
      liveLocationUpdateError,
    });
  }

  // SECURITY_OFFICER: confirm Gate OUT for any APPROVED pass (or INITIATOR_OUT for SUB_OUT two-step)
  if (action === "security_gate_out") {
    if (session.user.role !== "SECURITY_OFFICER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "APPROVED" && gatePass.status !== "INITIATOR_OUT") {
      return NextResponse.json({ error: "Gate pass must be APPROVED or initiator-confirmed" }, { status: 400 });
    }

    const now = new Date();
    const actualDepartureDate = now.toISOString().split("T")[0]; // "YYYY-MM-DD"
    const actualDepartureTime = now.toTimeString().slice(0, 5);   // "HH:MM"

    // Customer Delivery: vehicle goes directly to customer — complete immediately on Gate OUT
    const isCdPass = gatePass.passType === "CUSTOMER_DELIVERY";

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: isCdPass ? "COMPLETED" : "GATE_OUT",
        departureDate: actualDepartureDate,
        departureTime: actualDepartureTime,
        ...(mismatchNote ? { comments: `[MISMATCH] ${mismatchNote}` } : {}),
      },
    });

    // Always notify creator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_APPROVED",
        title: isCdPass ? "Security Confirmed Gate OUT — Delivery Complete" : "Security Confirmed Gate OUT",
        message: isCdPass
          ? `${gatePass.gatePassNumber} — Security Officer confirmed Gate OUT. Customer delivery is complete.`
          : `${gatePass.gatePassNumber} — Security Officer confirmed Gate OUT. Vehicle has been released.`,
        gatePassId: gatePass.id,
      },
    });

    // Notify SECURITY + INITIATOR at toLocation for Location Transfer
    if (gatePass.passType === "LOCATION_TRANSFER") {
      const toLoc = gatePass.toLocation as string | null;
      const locationFilter = toLoc ? { defaultLocation: ciLocation(toLoc) } : {};

      const [destSecurity, destInitiators] = await Promise.all([
        prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...locationFilter } }),
        prisma.user.findMany({ where: { role: "INITIATOR", ...locationFilter } }),
      ]);

      const allDestUsers = [...destSecurity, ...destInitiators];
      if (allDestUsers.length > 0) {
        await prisma.notification.createMany({
          data: allDestUsers.map((u) => ({
            userId: u.id,
            type: "GATE_PASS_RECEIVED",
            title: destSecurity.some(s => s.id === u.id)
              ? "Incoming Vehicle — Confirm Gate IN on Arrival"
              : "Vehicle Arriving — Confirm Gate IN When It Reaches You",
            message: destSecurity.some(s => s.id === u.id)
              ? `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — Security at FROM location confirmed Gate OUT. Vehicle is en route to ${toLoc ?? "your location"}. Please confirm Gate IN when it arrives.`
              : `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle is heading to ${toLoc ?? "your location"}. Check Vehicle Arrivals to confirm when it arrives.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    // For After Sales MAIN_OUT: notify RECIPIENTs
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_OUT") {
      const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((r) => ({
            userId: r.id,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Being Released to Customer",
            message: `Gate pass ${gatePass.gatePassNumber} — Security Officer confirmed vehicle release. Please confirm gate exit.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    // For After Sales SUB_OUT: notify destination Security + Initiators + ASOs
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_OUT") {
      const toLoc = gatePass.toLocation as string | null;
      const locationFilter = toLoc ? { defaultLocation: ciLocation(toLoc) } : {};

      const [destSecurity, destInitiators, asoUsers] = await Promise.all([
        prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...locationFilter } }),
        prisma.user.findMany({ where: { role: "INITIATOR", ...locationFilter } }),
        prisma.user.findMany({ where: { role: "AREA_SALES_OFFICER" } }),
      ]);

      const destUsers = [...destSecurity, ...destInitiators, ...asoUsers];
      if (destUsers.length > 0) {
        await prisma.notification.createMany({
          data: destUsers.map((u: { id: string }) => {
            const isSO = destSecurity.some((s: { id: string }) => s.id === u.id);
            const isInit = destInitiators.some((i: { id: string }) => i.id === u.id);
            return {
              userId: u.id,
              type: "GATE_PASS_RECEIVED",
              title: isSO
                ? "Incoming Vehicle — Confirm Gate IN on Arrival"
                : isInit
                ? "Vehicle Arriving — Check Vehicle Arrivals"
                : "Vehicle Heading Your Way — Confirm Sub IN on Arrival",
              message: isSO
                ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Security confirmed Gate OUT from ${gatePass.fromLocation ?? "source"}. Vehicle en route. Please confirm Gate IN when it arrives.`
                : isInit
                ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle is heading to ${toLoc ?? "your location"}. Check Vehicle Arrivals to confirm.`
                : `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Security confirmed Gate OUT. Vehicle is en route to your sub-location. Please confirm arrival.`,
              gatePassId: gatePass.id,
            };
          }),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR / AREA_SALES_OFFICER: mark as gate out (only for their own APPROVED passes, not MAIN_OUT — those go via Security Officer)
  if (action === "gate_out") {
    const canGateOut = session.user.role === "INITIATOR" || session.user.role === "AREA_SALES_OFFICER";
    if (!canGateOut) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (gatePass.status !== "APPROVED") {
      return NextResponse.json({ error: "Gate pass must be approved first" }, { status: 400 });
    }
    // MAIN_OUT, LOCATION_TRANSFER, and CUSTOMER_DELIVERY passes must go through Security Officer directly
    // MAIN_IN uses initiator_gate_in action (not gate_out)
    if (
      (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_OUT") ||
      (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_IN") ||
      gatePass.passType === "LOCATION_TRANSFER" ||
      gatePass.passType === "CUSTOMER_DELIVERY"
    ) {
      return NextResponse.json({ error: "This pass must be processed via the correct action" }, { status: 403 });
    }

    // SUB_OUT: smart two-step — check if a source SO exists at fromLocation
    // If YES: INITIATOR_OUT (source SO confirms Gate OUT) → then destination SO confirms Gate IN
    // If NO:  skip to GATE_OUT directly and notify destination SO + Initiators
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_OUT") {
      const fromLoc = gatePass.fromLocation as string | null;
      const sourceSOs = fromLoc
        ? await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, defaultLocation: ciLocation(fromLoc) } })
        : [];

      if (sourceSOs.length > 0) {
        // Source SO exists → two-step: INITIATOR_OUT, only notify source SO
        const updated = await prisma.gatePass.update({
          where: { id },
          data: { status: "INITIATOR_OUT" as any },
        });
        await prisma.notification.createMany({
          data: sourceSOs.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Sub OUT Ready — Confirm Gate Release",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Initiator confirmed departure. Please confirm Gate OUT at the security gate.`,
            gatePassId: gatePass.id,
          })),
        });
        return NextResponse.json({ gatePass: updated });
      } else {
        // No source SO → go directly to GATE_OUT, notify destination SO + Initiators
        const now = new Date();
        const updated = await prisma.gatePass.update({
          where: { id },
          data: {
            status: "GATE_OUT",
            departureDate: now.toISOString().split("T")[0],
            departureTime: now.toTimeString().slice(0, 5),
          },
        });
        const toLoc = gatePass.toLocation as string | null;
        const destFilter = toLoc ? { defaultLocation: ciLocation(toLoc) } : {};
        const [destSOs, destInitiators] = await Promise.all([
          prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...destFilter } }),
          prisma.user.findMany({ where: { role: "INITIATOR", ...destFilter } }),
        ]);
        const allDest = [...destSOs, ...destInitiators];
        if (allDest.length > 0) {
          const destSOIds = new Set(destSOs.map((s: { id: string }) => s.id));
          await prisma.notification.createMany({
            data: allDest.map((u: { id: string }) => ({
              userId: u.id,
              type: destSOIds.has(u.id) ? "GATE_PASS_APPROVED" : "GATE_PASS_RECEIVED",
              title: destSOIds.has(u.id) ? "Incoming Vehicle — Confirm Gate IN on Arrival" : "Vehicle Arriving — Check Vehicle Arrivals",
              message: destSOIds.has(u.id)
                ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle en route from ${fromLoc ?? "source"}. No source gate security. Please confirm Gate IN on arrival.`
                : `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle is heading to ${toLoc ?? "your location"}. Check Vehicle Arrivals.`,
              gatePassId: gatePass.id,
            })),
          });
        }
        return NextResponse.json({ gatePass: updated });
      }
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      data: { status: "GATE_OUT" },
    });

    // For AFTER_SALES: notify based on sub-type
    if (gatePass.passType === "AFTER_SALES") {
      // SUB_IN gated out by ASO: notify the parent MAIN_IN creator (INITIATOR) that vehicle arrived at service center
      if (gatePass.passSubType === "SUB_IN" && gatePass.parentPassId) {
        const parentPass = await (prisma.gatePass as any).findUnique({
          where: { id: gatePass.parentPassId },
          select: { createdById: true },
        });
        if (parentPass?.createdById) {
          await prisma.notification.create({
            data: {
              userId: parentPass.createdById,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Arrived at Service Center",
              message: `${gatePass.gatePassNumber} — vehicle has arrived at the service center. Please confirm receipt.`,
              gatePassId: gatePass.id,
            },
          });
        }
      }
      // SUB_OUT_IN going back to DIMO: notify the parent pass creator (Initiator) + Security Officers for Gate IN
      if (gatePass.passSubType === "SUB_OUT_IN" && gatePass.parentPassId) {
        const parentPass = await (prisma.gatePass as any).findUnique({
          where: { id: gatePass.parentPassId },
          select: { createdById: true },
        });
        if (parentPass?.createdById) {
          await prisma.notification.create({
            data: {
              userId: parentPass.createdById,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle En Route Back — Awaiting Security Gate IN",
              message: `${gatePass.gatePassNumber} — Vehicle is heading back to DIMO. Security Officer will confirm Gate IN when it arrives.`,
              gatePassId: gatePass.id,
            },
          });
        }
        // Notify Security Officers to confirm Gate IN
        const securityOfficers = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
        if (securityOfficers.length > 0) {
          await prisma.notification.createMany({
            data: securityOfficers.map((s: { id: string }) => ({
              userId: s.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Returning — Confirm Gate IN",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Vehicle is returning from sub-location. Please confirm Gate IN when it arrives.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
      // SUB_OUT: vehicle leaving DIMO HQ to sub-location — notify RECIPIENTs to confirm gate exit
      if (gatePass.passSubType === "SUB_OUT") {
        const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((r) => ({
              userId: r.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Heading to Sub-Location",
              message: `Gate pass ${gatePass.gatePassNumber} — vehicle is heading to a sub-location. Please confirm gate exit.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
      // MAIN_OUT: vehicle being released to customer — notify RECIPIENTs to confirm gate exit
      if (gatePass.passSubType === "MAIN_OUT") {
        const recipients = await prisma.user.findMany({ where: { role: "RECIPIENT" } });
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((r) => ({
              userId: r.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Being Released to Customer",
              message: `Gate pass ${gatePass.gatePassNumber} — vehicle is being released. Please confirm gate exit.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
      // MAIN_IN: vehicle is heading to DIMO service center — notify Security Officers to confirm Gate IN
      if (gatePass.passSubType === "MAIN_IN") {
        const securityOfficers = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
        if (securityOfficers.length > 0) {
          await prisma.notification.createMany({
            data: securityOfficers.map((s: { id: string }) => ({
              userId: s.id,
              type: "GATE_PASS_RECEIVED",
              title: "Service Vehicle Arriving — Confirm Gate IN",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — service/repair vehicle is on the way. Please confirm Gate IN when it arrives.`,
              gatePassId: gatePass.id,
            })),
          });
        }
      }
    } else {
      // Non-AFTER_SALES (LT): notify INITIATORs at toLocation
      const toLoc = gatePass.toLocation as string | null;
      const locationFilter = toLoc ? { defaultLocation: ciLocation(toLoc) } : {};
      const destInitiators = await prisma.user.findMany({ where: { role: "INITIATOR", ...locationFilter } });
      if (destInitiators.length > 0) {
        await prisma.notification.createMany({
          data: destInitiators.map((r) => ({
            userId: r.id,
            type: "GATE_PASS_RECEIVED",
            title: "Vehicle Arriving — Action Required",
            message: `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) is heading to ${toLoc ?? "your location"}. Check Vehicle Arrivals to confirm when it arrives.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // RECIPIENT / INITIATOR / AREA_SALES_OFFICER: confirm vehicle received (gate in = completed)
  if (action === "gate_in") {
    // RECIPIENT can gate_in:
    //   - Non-AFTER_SALES (LOCATION_TRANSFER, CUSTOMER_DELIVERY): any pass at GATE_OUT
    //   - AFTER_SALES: only MAIN_IN, MAIN_OUT, SUB_OUT (not SUB_IN or SUB_OUT_IN)
    const recipientAllowed = session.user.role === "RECIPIENT"
      && (gatePass.passType !== "AFTER_SALES"
          || ["MAIN_IN", "MAIN_OUT", "SUB_OUT"].includes(gatePass.passSubType ?? ""));
    // INITIATOR can confirm gate_in for LT passes heading to their location, and AFTER_SALES
    const initiatorAllowed = session.user.role === "INITIATOR"
      && (gatePass.passType === "LOCATION_TRANSFER" || gatePass.passType === "AFTER_SALES");
    const canGateIn = recipientAllowed
      || initiatorAllowed
      || (session.user.role === "AREA_SALES_OFFICER" && gatePass.passType === "AFTER_SALES");
    if (!canGateIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    // SUB_IN is confirmed by Security B (security_gate_in) — not directly by INITIATOR/ASO
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_IN" && gatePass.status === "APPROVED") {
      return NextResponse.json({ error: "SUB_IN gate confirmation must be done by Security Officer" }, { status: 403 });
    }
    // AFTER_SALES SUB_OUT_IN can go APPROVED → COMPLETED directly (no gate_out step needed)
    const allowDirectComplete = gatePass.passType === "AFTER_SALES"
      && gatePass.passSubType === "SUB_OUT_IN";
    if (gatePass.status !== "GATE_OUT" && !(allowDirectComplete && gatePass.status === "APPROVED")) {
      return NextResponse.json({ error: "Gate pass must be Gate Out first" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "COMPLETED",
        ...(receivedChassis ? { chassis: receivedChassis } : {}),
        ...(mismatchNote ? { comments: `[MISMATCH] ${mismatchNote}` } : {}),
      },
    });

    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_RECEIVED",
        title: "Vehicle Received",
        message: `Gate pass ${gatePass.gatePassNumber} confirmed received.${mismatch ? " A details mismatch was noted." : ""}`,
        gatePassId: gatePass.id,
      },
    });

    // SUB_OUT COMPLETED (ASO confirmed vehicle arrived at sub-location) → notify Initiator
    if (gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "SUB_OUT") {
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_RECEIVED",
          title: "Vehicle Arrived at Sub-Location",
          message: `${gatePass.gatePassNumber} — Area Sales Officer confirmed vehicle arrived at sub-location. A return pass (Sub OUT) will be created when the vehicle is ready to come back.`,
          gatePassId: gatePass.id,
        },
      });
    }

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR / AREA_SALES_OFFICER: resubmit a rejected pass
  if (action === "resubmit") {
    const canResubmit = session.user.role === "INITIATOR" || session.user.role === "AREA_SALES_OFFICER";
    if (!canResubmit) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (gatePass.status !== "REJECTED") {
      return NextResponse.json({ error: "Only rejected passes can be resubmitted" }, { status: 400 });
    }

    const {
      resubmitNote,
      // All editable fields — initiator can correct any data before resubmitting
      vehicle, chassis, make, vehicleColor,
      toLocation, fromLocation, outReason,
      departureDate, departureTime, arrivalDate, arrivalTime,
      transportMode, carrierName, carrierRegNo, companyName,
      driverName, driverNIC, driverContact,
      mileage, insurance, garagePlate,
      requestedBy,
    } = body;

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        resubmitCount: (gatePass.resubmitCount ?? 0) + 1,
        resubmitNote: resubmitNote || null,
        ...(vehicle        ? { vehicle }        : {}),
        ...(chassis        !== undefined ? { chassis }        : {}),
        ...(make           !== undefined ? { make }           : {}),
        ...(vehicleColor   !== undefined ? { vehicleColor }   : {}),
        ...(toLocation     ? { toLocation }     : {}),
        ...(fromLocation   !== undefined ? { fromLocation }   : {}),
        ...(outReason      !== undefined ? { outReason }      : {}),
        ...(departureDate  ? { departureDate }  : {}),
        ...(departureTime  ? { departureTime }  : {}),
        ...(arrivalDate    !== undefined ? { arrivalDate }    : {}),
        ...(arrivalTime    !== undefined ? { arrivalTime }    : {}),
        ...(transportMode  !== undefined ? { transportMode }  : {}),
        ...(carrierName    !== undefined ? { carrierName }    : {}),
        ...(carrierRegNo   !== undefined ? { carrierRegNo }   : {}),
        ...(companyName    !== undefined ? { companyName }    : {}),
        ...(driverName     !== undefined ? { driverName }     : {}),
        ...(driverNIC      !== undefined ? { driverNIC }      : {}),
        ...(driverContact  !== undefined ? { driverContact }  : {}),
        ...(mileage        !== undefined ? { mileage }        : {}),
        ...(insurance      !== undefined ? { insurance }      : {}),
        ...(garagePlate    !== undefined ? { garagePlate }    : {}),
        ...(requestedBy    !== undefined ? { requestedBy }    : {}),
      },
    });

    // Notify all approvers
    const approvers = await prisma.user.findMany({ where: { role: "APPROVER" } });
    if (approvers.length > 0) {
      await prisma.notification.createMany({
        data: approvers.map((a) => ({
          userId: a.id,
          type: "GATE_PASS_RESUBMITTED",
          title: "Gate Pass Resubmitted",
          message: `Gate pass ${gatePass.gatePassNumber} was resubmitted after rejection and needs your review.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR: cancel their own PENDING_APPROVAL pass
  if (action === "cancel") {
    if (session.user.role !== "INITIATOR" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (gatePass.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ error: "Only pending passes can be cancelled" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: "CANCELLED" as any },
    });

    return NextResponse.json({ gatePass: updated });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
