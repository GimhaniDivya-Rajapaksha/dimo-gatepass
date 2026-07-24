import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlantLocationOptions, findPlantLocationOption, updateVehiclePlantLocation, type PlantLocationTarget } from "@/lib/location-api";
import { findApproversForLocationBrand } from "@/lib/approver-routing";

function ciLocation(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? { equals: normalized, mode: "insensitive" as const } : undefined;
}

function plantPrefix(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.split(" - ")[0].trim() : "";
}

function ciStartsWithPlant(value: string | null | undefined) {
  const plant = plantPrefix(value);
  return plant ? { startsWith: plant, mode: "insensitive" as const } : undefined;
}

// Resolve a location label to its SAP plant code via the LocationOption table,
// then return all Security Officers whose defaultLocation resolves to the same plant code.
// Falls back to ciStartsWithPlant if the location is not in the LocationOption table.
async function findSOsAtSamePlant(fromLoc: string | null): Promise<{ id: string }[]> {
  if (!fromLoc) return prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });

  const allOpts = await prisma.locationOption.findMany();
  const needle = fromLoc.trim().toLowerCase();
  const srcOpt = allOpts.find(
    (o) => `${o.plantDescription} - ${o.storageDescription}`.toLowerCase() === needle
  );

  if (!srcOpt) {
    return prisma.user.findMany({
      where: { role: "SECURITY_OFFICER" as any, defaultLocation: ciStartsWithPlant(fromLoc) },
    });
  }

  // Match SOs whose defaultLocation also resolves to the same plant code.
  // If the SO's defaultLocation is not in LocationOption, fall back to plant-prefix comparison.
  const allSOs = await prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any } });
  return allSOs.filter((so) => {
    const soLower = (so.defaultLocation ?? "").toLowerCase();
    const soOpt = allOpts.find(
      (o) => `${o.plantDescription} - ${o.storageDescription}`.toLowerCase() === soLower
    );
    if (soOpt) return soOpt.plantCode === srcOpt.plantCode;
    // SO's location not in LocationOption — match by plant-description prefix
    const soPlant = (so.defaultLocation ?? "").split(" - ")[0].trim().toLowerCase();
    return soPlant === srcOpt.plantDescription.toLowerCase();
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, rejectionReason, mismatch, mismatchNote, receivedChassis, writeSap } = body;

  const gatePass = await (prisma.gatePass as any).findUnique({ where: { id } });
  if (!gatePass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // LT Return Gate Pass: locked until the original (parent) transfer completes.
  // returnPassLocked defaults to false for every other pass, so this never affects anything else.
  if (gatePass.returnPassLocked) {
    return NextResponse.json({ error: "This Return Gate Pass is locked until the original Location Transfer is completed." }, { status: 400 });
  }

  // APPROVER: approve credit portion of MAIN_OUT (parallel with cashier)
  if (action === "credit_approve") {
    if (session.user.role !== "APPROVER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const eligibleForCreditApprove =
      gatePass.passSubType === "MAIN_OUT" ||
      (gatePass.hasCredit && gatePass.status === "CASHIER_REVIEW");
    if (!eligibleForCreditApprove) {
      return NextResponse.json({ error: "credit_approve only valid for mixed-payment passes" }, { status: 400 });
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

      const isCdPass = gatePass.passType === "CUSTOMER_DELIVERY";
      // Notify pass creator — for CD, instruct to print (bypasses security); for others, security confirms
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_APPROVED",
          title: isCdPass ? "Payment Cleared — Print Gate Pass to Release Vehicle" : "All Checks Complete — Awaiting Security Gate Release",
          message: isCdPass
            ? `Gate pass ${gatePass.gatePassNumber} — credit approved and payment cleared. Please print the gate pass to complete the delivery. No Security Officer step required.`
            : `Gate pass ${gatePass.gatePassNumber} — credit approved and payment cleared. Security Officer will confirm Gate OUT.`,
          gatePassId: gatePass.id,
        },
      });

      // Security Officers are only notified for non-CD passes — CD uses initiator print to bypass security
      if (!isCdPass) {
        const securityOfficers = await findSOsAtSamePlant(gatePass.fromLocation as string | null);
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

  // APPROVER: reject credit portion of a mixed-payment CUSTOMER_DELIVERY pass
  if (action === "credit_reject") {
    if (session.user.role !== "APPROVER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const eligibleForCreditReject =
      gatePass.hasCredit && gatePass.status === "CASHIER_REVIEW";
    if (!eligibleForCreditReject) {
      return NextResponse.json({ error: "credit_reject only valid for mixed-payment passes in CASHIER_REVIEW" }, { status: 400 });
    }
    if (gatePass.creditApproved) {
      return NextResponse.json({ error: "Credit has already been approved" }, { status: 400 });
    }

    await prisma.$executeRaw`UPDATE "GatePass" SET "creditRejected" = true, "approvedById" = ${session.user.id}, "approvedAt" = NOW() WHERE id = ${id}`;

    const updatedPass = await (prisma.gatePass as any).findUnique({ where: { id } });
    const cashierDone = updatedPass?.cashierCleared === true || updatedPass?.hasImmediate === false;

    const reason = rejectionReason || null;

    if (cashierDone) {
      // Immediate already cleared — move to APPROVED; credit rejection is noted
      await prisma.gatePass.update({ where: { id }, data: { status: "APPROVED" } });

      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_APPROVED",
          title: "Gate Pass Approved (Credit Rejected)",
          message: `Gate pass ${gatePass.gatePassNumber} — immediate payment cleared by cashier. Credit orders were rejected by the approver.${reason ? ` Reason: ${reason}` : ""}`,
          gatePassId: gatePass.id,
        },
      });

      const securityOfficers = await findSOsAtSamePlant(gatePass.fromLocation as string | null);
      if (securityOfficers.length > 0) {
        await prisma.notification.createMany({
          data: securityOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Vehicle Cleared — Ready for Gate OUT",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — immediate payment cleared. Credit orders rejected. Please confirm gate release.`,
            gatePassId: gatePass.id,
          })),
        });
      }

      return NextResponse.json({ ok: true, status: "APPROVED" });
    } else {
      // Cashier still working — stay in CASHIER_REVIEW, notify initiator and cashiers
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_REJECTED",
          title: "Credit Orders Rejected by Approver",
          message: `Gate pass ${gatePass.gatePassNumber} — the approver rejected the credit orders.${reason ? ` Reason: ${reason}` : ""} Cashier will proceed with immediate payment orders only.`,
          gatePassId: gatePass.id,
        },
      });

      const cashiers = await prisma.user.findMany({
        where: gatePass.fromLocation
          ? { role: "CASHIER" as any, defaultLocation: gatePass.fromLocation }
          : { role: "CASHIER" as any },
      });
      if (cashiers.length > 0) {
        await prisma.notification.createMany({
          data: cashiers.map((c: { id: string }) => ({
            userId: c.id,
            type: "GATE_PASS_SUBMITTED",
            title: "Credit Rejected — Proceed with Immediate Orders",
            message: `${gatePass.gatePassNumber} — approver rejected credit orders. Please generate invoice for immediate payment orders only.`,
            gatePassId: gatePass.id,
          })),
        });
      }

      return NextResponse.json({ ok: true, status: "CASHIER_REVIEW" });
    }
  }

  // APPROVER: approve or reject
  if (action === "approve" || action === "reject") {
    if (session.user.role !== "APPROVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // If the pass was originally created by a Security Officer, the vehicle is already
    // physically at the gate — skip APPROVED and jump straight to COMPLETED on approval.
    let isSecurityInitiated = false;
    if (action === "approve") {
      const creator = await prisma.user.findUnique({
        where: { id: gatePass.createdById },
        select: { role: true },
      });
      isSecurityInitiated = creator?.role === "SECURITY_OFFICER";
    }

    const newStatus = action === "reject"
      ? "REJECTED"
      : isSecurityInitiated
      ? "COMPLETED"
      : "APPROVED";

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: newStatus,
        approvedById: session.user.id,
        approvedAt: new Date(),
        rejectionReason: action === "reject" ? (rejectionReason || null) : null,
      },
    });

    // Notify the pass creator (security officer or initiator)
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: action === "approve" ? "GATE_PASS_APPROVED" : "GATE_PASS_REJECTED",
        title: action === "approve"
          ? (isSecurityInitiated ? "Gate Pass Approved & Completed" : "Gate Pass Approved")
          : "Gate Pass Rejected",
        message:
          action === "approve"
            ? isSecurityInitiated
              ? `Gate pass ${gatePass.gatePassNumber} has been approved and automatically completed — vehicle was already confirmed at the gate.`
              : `Your gate pass ${gatePass.gatePassNumber} has been approved.`
            : `Your gate pass ${gatePass.gatePassNumber} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
        gatePassId: gatePass.id,
      },
    });

    // Send approval notification email to creator and requestedBy
    if (action === "approve" && newStatus === "APPROVED") {
      const { sendApprovalNotificationEmail } = await import("@/lib/email");
      const creator = await prisma.user.findUnique({
        where: { id: gatePass.createdById },
        select: { email: true, name: true },
      });
      const emailData = {
        gatePassNumber: gatePass.gatePassNumber,
        passId: gatePass.id,
        passType: gatePass.passType,
        vehicle: gatePass.vehicle ?? "",
        chassis: gatePass.chassis,
        createdByName: creator?.name ?? "",
        toLocation: gatePass.toLocation,
        fromLocation: gatePass.fromLocation,
        approverName: session.user.name ?? "Approver",
      };
      if (creator?.email) {
        sendApprovalNotificationEmail(creator.email, creator.name ?? "Initiator", emailData)
          .catch((e: unknown) => console.error("[email] approval notification failed:", e));
      }
      const rbEmail = gatePass.requestedByEmail as string | null;
      const rbName = gatePass.requestedBy as string | null;
      if (rbEmail && rbEmail !== creator?.email) {
        sendApprovalNotificationEmail(rbEmail, rbName ?? "Requested By", emailData)
          .catch((e: unknown) => console.error("[email] approval notification (requestedBy) failed:", e));
      }
    }

    // CD: send rejection email to Initiator when rejected via UI
    if (action === "reject" && gatePass.passType === "CUSTOMER_DELIVERY") {
      const { sendRejectionNotificationEmail } = await import("@/lib/email");
      const cdCreator = await prisma.user.findUnique({
        where: { id: gatePass.createdById },
        select: { email: true, name: true },
      });
      if (cdCreator?.email) {
        sendRejectionNotificationEmail(cdCreator.email, cdCreator.name ?? "Initiator", {
          gatePassNumber: gatePass.gatePassNumber,
          passId: gatePass.id,
          passType: gatePass.passType,
          passSubType: gatePass.passSubType,
          vehicle: gatePass.vehicle ?? "",
          chassis: gatePass.chassis,
          createdByName: cdCreator.name ?? "Initiator",
          rejectionReason: rejectionReason || "No reason provided",
          approverName: session.user.name ?? "Approver",
        }).catch((e: unknown) => console.error("[email] CD rejection notification failed:", e));
      }
    }

    // For security-initiated passes: also notify admins & the initiator who completed the form
    if (isSecurityInitiated && action === "approve") {
      const [admins, initiators] = await Promise.all([
        prisma.user.findMany({ where: { role: "ADMIN" } }),
        prisma.user.findMany({ where: { role: "INITIATOR", defaultLocation: ciLocation(gatePass.fromLocation) } }),
      ]);
      const extraRecipients = [...admins, ...initiators].filter((u: { id: string }) => u.id !== gatePass.createdById);
      if (extraRecipients.length > 0) {
        await prisma.notification.createMany({
          data: extraRecipients.map((u: { id: string }) => ({
            userId: u.id,
            type: "GATE_PASS_APPROVED",
            title: "Gate Pass Completed (Security Initiated)",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — approved and completed. Security Officer created this pass; vehicle was already at the gate.`,
            gatePassId: gatePass.id,
          })),
        });
      }
      return NextResponse.json({ gatePass: updated });
    }

    // Normal approval: notify Security Officers at fromLocation (LT, MAIN_OUT, CD)
    const needsSecurityNotify = (
      (action === "approve" && gatePass.passType === "AFTER_SALES" && gatePass.passSubType === "MAIN_OUT") ||
      (action === "approve" && gatePass.passType === "LOCATION_TRANSFER") ||
      (action === "approve" && gatePass.passType === "CUSTOMER_DELIVERY")
    );
    if (needsSecurityNotify) {
      const fromLoc = gatePass.fromLocation as string | null;
      const securityOfficers = await findSOsAtSamePlant(fromLoc);
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
    // Read escalationApproved via raw SQL — Prisma client may predate this column.
    if ((gatePass as any).singleOrderEscalated) {
      const escRow: { escalationApproved: boolean }[] =
        await prisma.$queryRaw`SELECT "escalationApproved" FROM "GatePass" WHERE id = ${id} LIMIT 1`;
      const escalationApproved = escRow[0]?.escalationApproved ?? false;
      if (!escalationApproved) {
        return NextResponse.json({ error: "Awaiting approver sign-off — cashier cannot generate invoice yet" }, { status: 400 });
      }
    }

    const creditStillPending = !!(gatePass.hasCredit && !gatePass.creditApproved);
    const newCdStatus = creditStillPending ? "CASHIER_REVIEW" : "APPROVED";

    await prisma.gatePass.update({
      where: { id },
      data: { status: newCdStatus, cashierCleared: true },
    });

    if (newCdStatus === "APPROVED") {
      // Notify Security Officers at fromLocation — Security Gate OUT or Initiator print (first one wins) → COMPLETED
      // Initiator notification is deferred until Cashier confirms receipt via cashier_confirm_receipt
      const securityOfficers = await findSOsAtSamePlant(gatePass.fromLocation as string | null);
      if (securityOfficers.length > 0) {
        await prisma.notification.createMany({
          data: securityOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Customer Delivery — Payment Cleared — Confirm Gate OUT",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — immediate payment cleared by Cashier. Please confirm Gate OUT.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    } else {
      // Cashier done but credit approval still pending — notify initiator
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_SUBMITTED",
          title: "Cashier Done — Awaiting Credit Approval",
          message: `Gate pass ${gatePass.gatePassNumber} — cashier cleared immediate orders. Waiting for approver to approve credit orders.`,
          gatePassId: gatePass.id,
        },
      });
    }

    return NextResponse.json({ ok: true, status: newCdStatus, creditPending: creditStillPending });
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
    const isTestDrive = gatePass.passType === "TEST_DRIVE";

    // SUB_IN: confirmed at APPROVED (Security B confirms vehicle entered ASO compound)
    // MAIN_IN: confirmed at APPROVED directly (no initiator step) or INITIATOR_IN (legacy) or GATE_OUT (legacy)
    // SUB_OUT: destination Security confirms Gate IN at GATE_OUT or INITIATOR_OUT status
    //   (INITIATOR_OUT = Initiator confirmed departure but no source SO processed Gate OUT)
    // Test Drive: same-plant return, confirmed at GATE_OUT (same as LT)
    // Others: confirmed at GATE_OUT
    const validSubIn          = isSubIn && gatePass.passType === "AFTER_SALES" && gatePass.status === "APPROVED";
    const validApprovedMainIn = isMainIn && gatePass.passType === "AFTER_SALES" && gatePass.status === "APPROVED";
    const validGateOut        = gatePass.status === "GATE_OUT" && (isMainIn || isSubOut || isSubOutIn || isLT || isTestDrive);
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
        gateInBy: session.user.name ?? null,
        ...(body.receivedChassis ? { chassis: body.receivedChassis } : {}),
        ...(body.mismatchNote ? { comments: `[MISMATCH] ${body.mismatchNote}` } : {}),
      },
    });

    // LT Return Gate Pass: unlock the linked return pass now that the original has completed.
    if (isLT) {
      await prisma.gatePass.updateMany({
        where: { parentPassId: gatePass.id, returnPassLocked: true },
        data: { returnPassLocked: false },
      });
    }

    const targetLabel = gatePass.toLocation as string | null;
    if ((isSubOut || isSubOutIn || validApprovedMainIn || validSubIn) && targetLabel) {
      try {
        const plantOptions = await fetchPlantLocationOptions().catch(() => []);
        let targetLocation = findPlantLocationOption(plantOptions, targetLabel);

        // SAP live options only include locations with vehicles currently parked there.
        // Fall back to the DB LocationOption table which covers all configured locations.
        if (!targetLocation) {
          // Order by plantCode ascending so numeric SAP Werks codes (e.g. "1106")
          // are preferred over legacy descriptive codes (e.g. "MB800") for the same location.
          const dbLocations = await prisma.locationOption.findMany({ orderBy: { plantCode: "asc" } });
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
              internalNo: (gatePass as any).sapVehicleId,
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

    // LT: notify ASOs at fromLocation (source) that Security confirmed vehicle arrived at destination
    if (isLT && gatePass.fromLocation) {
      const fromAsoFilterSec = ciStartsWithPlant(gatePass.fromLocation as string);
      if (fromAsoFilterSec) {
        const fromAsosSec = await prisma.user.findMany({
          where: { role: "AREA_SALES_OFFICER" as any, defaultLocation: fromAsoFilterSec },
          select: { id: true, email: true, name: true },
        });
        if (fromAsosSec.length > 0) {
          const secName = session.user.name ?? "Security Officer";
          await prisma.notification.createMany({
            data: fromAsosSec.map((aso: { id: string }) => ({
              userId: aso.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Arrived at Destination",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle ?? ""}) — Security Officer ${secName} at ${gatePass.toLocation ?? "destination"} confirmed Gate IN. Vehicle transferred from ${gatePass.fromLocation} to ${gatePass.toLocation ?? "destination"}.`,
              gatePassId: gatePass.id,
            })),
          });
          const { sendAsoArrivalEmail } = await import("@/lib/email");
          for (const aso of fromAsosSec) {
            sendAsoArrivalEmail(aso.email, aso.name ?? "ASO", id, {
              gatePassNumber: gatePass.gatePassNumber,
              vehicle: gatePass.vehicle ?? "",
              chassis: gatePass.chassis,
              fromLocation: gatePass.fromLocation as string,
              toLocation: gatePass.toLocation as string | null,
              confirmedByName: secName,
              confirmedByRole: "Security Officer",
            }).catch((e: unknown) => console.error("[email] ASO arrival notification (security_gate_in) failed:", e));
          }
        }
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
        gateOutBy: session.user.name ?? null,
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

    // Notify destination security, initiators, and plant ASOs for Location Transfer.
    let liveLocationUpdate: { message: string; currentLocation: { label: string; plantCode: string; storageLocation: string } } | null = null;
    let liveLocationUpdateError: string | null = null;
    if (gatePass.passType === "LOCATION_TRANSFER") {
      const toLoc = gatePass.toLocation as string | null;
      const toPlant = toLoc ? toLoc.split(" - ")[0].trim() : null;
      const toCode  = toLoc ? toLoc.split(" - ").slice(1).join(" - ").trim() : null;
      // OR: match by plant-prefix (primary) or storage-code contains (fallback for format variations)
      const destLocationWhere = toPlant && toCode
        ? { OR: [{ defaultLocation: { startsWith: toPlant, mode: "insensitive" as const } }, { defaultLocation: { contains: toCode, mode: "insensitive" as const } }] }
        : toPlant ? { defaultLocation: { startsWith: toPlant, mode: "insensitive" as const } }
        : toCode  ? { defaultLocation: { contains: toCode,  mode: "insensitive" as const } }
        : {};

      const [destSecurity, destInitiators, asoUsers] = await Promise.all([
        prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...destLocationWhere } }),
        prisma.user.findMany({ where: { role: "INITIATOR", ...destLocationWhere } }),
        prisma.user.findMany({ where: { role: "AREA_SALES_OFFICER", ...destLocationWhere } }),
      ]);

      const allDestUsers = [...new Map([...destSecurity, ...destInitiators, ...asoUsers].map(u => [u.id, u])).values()];
      if (allDestUsers.length > 0) {
        await prisma.notification.createMany({
          data: allDestUsers.map((u) => {
            const isDestSecurity = destSecurity.some(s => s.id === u.id);
            const isDestAso = asoUsers.some(a => a.id === u.id);
            return {
              userId: u.id,
              type: "GATE_PASS_RECEIVED",
              title: isDestSecurity
                ? "Incoming Vehicle - Confirm Gate IN on Arrival"
                : isDestAso
                  ? "Incoming Vehicle - Confirm Arrival at Your Plant"
                  : "Vehicle Arriving - Confirm Gate IN When It Reaches You",
              message: isDestSecurity
                ? `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) - Security at FROM location confirmed Gate OUT. Vehicle is en route to ${toLoc ?? "your location"}. Please confirm Gate IN when it arrives.`
                : isDestAso
                  ? `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) - vehicle is heading to ${toLoc ?? "your plant"}. Open ASO Vehicle Arrivals to confirm when it arrives.`
                  : `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) - vehicle is heading to ${toLoc ?? "your location"}. Check Vehicle Arrivals to confirm when it arrives.`,
              gatePassId: gatePass.id,
            };
          }),
        });
      }

      // Send Confirm Arrival email to TO-plant ASOs (LT only)
      if (gatePass.passType === "LOCATION_TRANSFER" && asoUsers.length > 0) {
        const { sendAsoConfirmArrivalEmail } = await import("@/lib/email");
        for (const aso of asoUsers as { id: string; email: string | null; name: string | null }[]) {
          if (aso.email) {
            sendAsoConfirmArrivalEmail(aso.email, aso.name ?? "ASO", id, aso.id, {
              gatePassNumber: gatePass.gatePassNumber,
              vehicle: gatePass.vehicle ?? "",
              chassis: gatePass.chassis,
              fromLocation: gatePass.fromLocation,
              toLocation: toLoc,
            }).catch((e: unknown) => console.error("[email] ASO confirm-arrival email (security_gate_out) failed:", e));
          }
        }
      }

      // NEW: Notify FROM-location ASOs when gate pass was created by an Initiator (not ASO)
      if (!gatePass.asoCreated && gatePass.fromLocation) {
        const fromAsoFilter = { defaultLocation: ciStartsWithPlant(gatePass.fromLocation) };
        const fromAsos = await prisma.user.findMany({
          where: { role: "AREA_SALES_OFFICER" as any, ...fromAsoFilter },
          select: { id: true, email: true, name: true },
        });
        if (fromAsos.length > 0) {
          await prisma.notification.createMany({
            data: fromAsos.map((aso: { id: string }) => ({
              userId: aso.id,
              type: "GATE_PASS_APPROVED",
              title: "Vehicle Transferred Out of Your Location",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle transferred from ${gatePass.fromLocation} to ${gatePass.toLocation ?? "another location"} by Initiator ${session.user.name ?? ""}.`,
              gatePassId: gatePass.id,
            })),
          });
          const { sendAsoTransferOutEmail } = await import("@/lib/email");
          for (const aso of fromAsos) {
            sendAsoTransferOutEmail(aso.email, aso.name ?? "ASO", id, {
              gatePassNumber: gatePass.gatePassNumber,
              passType: gatePass.passType,
              vehicle: gatePass.vehicle ?? "",
              chassis: gatePass.chassis,
              fromLocation: gatePass.fromLocation,
              toLocation: gatePass.toLocation,
              createdByName: session.user.name ?? "Initiator",
            }).catch((e: unknown) => console.error("[email] ASO transfer-out notification failed:", e));
          }
        }
      }

      // SAP: update vehicle location to destination now that source Security confirmed Gate OUT
      if (toLoc) {
        try {
          let targetLocation: PlantLocationTarget | null = null;

          // Prefer codes stored at creation — works even when destination has no vehicles yet in SAP feed
          if (gatePass.toPlantCode && gatePass.toStorageLocation) {
            targetLocation = {
              plantCode: gatePass.toPlantCode,
              plantDescription: gatePass.toLocation ?? "",
              storageLocation: gatePass.toStorageLocation,
              storageDescription: "",
            };
          } else {
            // Legacy fallback: description-string lookup (only succeeds if location is in live SAP feed or LocationOption table)
            const plantOptions = await fetchPlantLocationOptions().catch(() => []);
            targetLocation = findPlantLocationOption(plantOptions, toLoc);
            if (!targetLocation) {
              const dbLocations = await prisma.locationOption.findMany({ orderBy: { plantCode: "asc" } });
              targetLocation = findPlantLocationOption(
                dbLocations.map((l) => ({
                  plantCode: l.plantCode,
                  plantDescription: l.plantDescription,
                  storageLocation: l.storageLocation,
                  storageDescription: l.storageDescription,
                })),
                toLoc
              );
            }
          }

          if (targetLocation) {
            liveLocationUpdate = await updateVehiclePlantLocation({
              identifiers: [gatePass.vehicle, gatePass.chassis],
              destination: targetLocation,
              sapFallback: { internalNo: (gatePass as any).sapVehicleId, externalNo: gatePass.vehicle, chassisNo: gatePass.chassis },
            });
            console.log("[security_gate_out] SAP location updated:", liveLocationUpdate.message);
          } else {
            liveLocationUpdateError = `SAP location not resolved for "${toLoc}" — no matching plant/sloc found. This pass was likely created before the latest fix and has no stored plant/sloc codes.`;
            console.warn("[security_gate_out] no matching SAP plant location for:", toLoc);
          }
        } catch (error) {
          liveLocationUpdateError = error instanceof Error ? error.message : "Vehicle location API update failed.";
          console.error("[security_gate_out] SAP location update failed:", error);
        }
      }
    }

    // Test Drive: no SAP write, no destination transfer — just notify Security Officers
    // and Initiators at the same plant that the vehicle is out and awaiting return confirmation.
    if (gatePass.passType === "TEST_DRIVE" && gatePass.fromLocation) {
      const plantWhere = { defaultLocation: ciStartsWithPlant(gatePass.fromLocation) };
      const [tdSecurity, tdInitiators] = await Promise.all([
        prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...plantWhere } }),
        prisma.user.findMany({ where: { role: "INITIATOR", ...plantWhere } }),
      ]);
      const tdRecipients = [...new Map([...tdSecurity, ...tdInitiators].map((u) => [u.id, u])).values()];
      if (tdRecipients.length > 0) {
        await prisma.notification.createMany({
          data: tdRecipients.map((u) => ({
            userId: u.id,
            type: "GATE_PASS_RECEIVED",
            title: "Test Drive Vehicle Out — Awaiting Return",
            message: `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle left for a Test Drive. Check Vehicle Arrivals to confirm when it returns.`,
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
      const asoPlantFilter = toLoc ? { defaultLocation: ciStartsWithPlant(toLoc) } : {};

      const [destSecurity, destInitiators, asoUsers] = await Promise.all([
        prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...locationFilter } }),
        prisma.user.findMany({ where: { role: "INITIATOR", ...locationFilter } }),
        prisma.user.findMany({ where: { role: "AREA_SALES_OFFICER", ...asoPlantFilter } }),
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

    return NextResponse.json({ gatePass: updated, liveLocationUpdate, liveLocationUpdateError });
  }

  // Print Gate OUT: initiator printing the gate pass counts as Gate OUT confirmation.
  // Security no longer needs to confirm Gate OUT for LT and CD when initiator prints.
  if (action === "print_gate_out") {
    const canPrintRelease = session.user.role === "INITIATOR" || session.user.role === "SERVICE_ADVISOR" || session.user.role === "AREA_SALES_OFFICER";
    if (!canPrintRelease) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const isCreator = gatePass.createdById === session.user.id;
    const asoDefaultLoc = (session.user as { defaultLocation?: string | null }).defaultLocation;
    const isFromLocationAso =
      session.user.role === "AREA_SALES_OFFICER" &&
      !!asoDefaultLoc &&
      !!gatePass.fromLocation &&
      plantPrefix(asoDefaultLoc) === plantPrefix(gatePass.fromLocation as string);
    if (!isCreator && !isFromLocationAso) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!["APPROVED", "GATE_OUT", "COMPLETED"].includes(gatePass.status)) {
      return NextResponse.json({ error: "Gate pass must be approved first" }, { status: 400 });
    }
    if (gatePass.passType !== "LOCATION_TRANSFER" && gatePass.passType !== "CUSTOMER_DELIVERY" && gatePass.passType !== "TEST_DRIVE") {
      return NextResponse.json({ error: "Print Gate OUT is only available for Location Transfer, Customer Delivery, and Test Drive" }, { status: 400 });
    }

    // Already past APPROVED — just return, status is fine
    if (gatePass.status !== "APPROVED") {
      return NextResponse.json({ gatePass });
    }

    // Printing = Gate OUT for initiator (bypasses security gate out step)
    const now = new Date();
    const isCdPass = gatePass.passType === "CUSTOMER_DELIVERY";
    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: isCdPass ? "COMPLETED" : "GATE_OUT",
        departureDate: now.toISOString().split("T")[0],
        departureTime: now.toTimeString().slice(0, 5),
        gateOutBy: session.user.name ?? null,
      },
    });

    // Notify creator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_APPROVED",
        title: isCdPass ? "Gate Pass Printed — Delivery Complete" : "Gate Pass Printed — Vehicle Released",
        message: isCdPass
          ? `${gatePass.gatePassNumber} — Gate pass printed. Customer delivery is complete.`
          : `${gatePass.gatePassNumber} — Gate pass printed. Vehicle has been released and is in transit.`,
        gatePassId: gatePass.id,
      },
    });

    // For LT: notify destination security + initiators that vehicle is en route
    let printLiveUpdate: { message: string; currentLocation: { label: string; plantCode: string; storageLocation: string } } | null = null;
    let printLiveUpdateError: string | null = null;
    if (gatePass.passType === "LOCATION_TRANSFER") {
      const toLoc = gatePass.toLocation as string | null;
      const toPlant2 = toLoc ? toLoc.split(" - ")[0].trim() : null;
      const toCode2  = toLoc ? toLoc.split(" - ").slice(1).join(" - ").trim() : null;
      const destLocationWhere2 = toPlant2 && toCode2
        ? { OR: [{ defaultLocation: { startsWith: toPlant2, mode: "insensitive" as const } }, { defaultLocation: { contains: toCode2, mode: "insensitive" as const } }] }
        : toPlant2 ? { defaultLocation: { startsWith: toPlant2, mode: "insensitive" as const } }
        : toCode2  ? { defaultLocation: { contains: toCode2,  mode: "insensitive" as const } }
        : {};
      const [destSecurity, destInitiators, destAsos] = await Promise.all([
        prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...destLocationWhere2 } }),
        prisma.user.findMany({ where: { role: "INITIATOR", ...destLocationWhere2 } }),
        prisma.user.findMany({ where: { role: "AREA_SALES_OFFICER", ...destLocationWhere2 } }),
      ]);
      const allDestUsers = [...new Map([...destSecurity, ...destInitiators, ...destAsos].map(u => [u.id, u])).values()];
      if (allDestUsers.length > 0) {
        const destSOIds  = new Set(destSecurity.map((s: { id: string }) => s.id));
        const destAsoIds = new Set(destAsos.map((a: { id: string }) => a.id));
        await prisma.notification.createMany({
          data: allDestUsers.map((u: { id: string }) => ({
            userId: u.id,
            type: "GATE_PASS_RECEIVED",
            title: destSOIds.has(u.id)
              ? "Incoming Vehicle — Confirm Gate IN on Arrival"
              : destAsoIds.has(u.id)
                ? "Incoming Vehicle — Confirm Arrival at Your Plant"
                : "Vehicle Arriving — Confirm Gate IN When It Reaches You",
            message: destSOIds.has(u.id)
              ? `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — gate pass printed and released. Vehicle is en route to ${toLoc ?? "your location"}. Please confirm Gate IN when it arrives.`
              : destAsoIds.has(u.id)
                ? `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle is heading to ${toLoc ?? "your plant"}. Open ASO Vehicle Arrivals to confirm when it arrives.`
                : `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle is heading to ${toLoc ?? "your location"}. Check Vehicle Arrivals to confirm when it arrives.`,
            gatePassId: gatePass.id,
          })),
        });
      }

      // Send Confirm Arrival email to TO-plant ASOs (LT only)
      if (gatePass.passType === "LOCATION_TRANSFER" && destAsos.length > 0) {
        const { sendAsoConfirmArrivalEmail } = await import("@/lib/email");
        for (const aso of destAsos as { id: string; email: string | null; name: string | null }[]) {
          if (aso.email) {
            sendAsoConfirmArrivalEmail(aso.email, aso.name ?? "ASO", id, aso.id, {
              gatePassNumber: gatePass.gatePassNumber,
              vehicle: gatePass.vehicle ?? "",
              chassis: gatePass.chassis,
              fromLocation: gatePass.fromLocation,
              toLocation: toLoc,
            }).catch((e: unknown) => console.error("[email] ASO confirm-arrival email (print_gate_out) failed:", e));
          }
        }
      }

      // NEW: Notify FROM-location ASOs when gate pass was created by an Initiator (not ASO)
      if (!gatePass.asoCreated && gatePass.fromLocation) {
        const fromAsoFilterPrint = { defaultLocation: ciStartsWithPlant(gatePass.fromLocation) };
        const fromAsosPrint = await prisma.user.findMany({
          where: { role: "AREA_SALES_OFFICER" as any, ...fromAsoFilterPrint },
          select: { id: true, email: true, name: true },
        });
        if (fromAsosPrint.length > 0) {
          await prisma.notification.createMany({
            data: fromAsosPrint.map((aso: { id: string }) => ({
              userId: aso.id,
              type: "GATE_PASS_APPROVED",
              title: "Vehicle Transferred Out of Your Location",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle transferred from ${gatePass.fromLocation} to ${gatePass.toLocation ?? "another location"} by Initiator ${session.user.name ?? ""}.`,
              gatePassId: gatePass.id,
            })),
          });
          const { sendAsoTransferOutEmail } = await import("@/lib/email");
          for (const aso of fromAsosPrint) {
            sendAsoTransferOutEmail(aso.email, aso.name ?? "ASO", id, {
              gatePassNumber: gatePass.gatePassNumber,
              passType: gatePass.passType,
              vehicle: gatePass.vehicle ?? "",
              chassis: gatePass.chassis,
              fromLocation: gatePass.fromLocation,
              toLocation: gatePass.toLocation,
              createdByName: session.user.name ?? "Initiator",
            }).catch((e: unknown) => console.error("[email] ASO transfer-out notification failed:", e));
          }
        }
      }

      // SAP: update vehicle location to destination now that initiator printed (bypasses source Security Gate OUT)
      // Only runs if initiator confirmed SAP write in the confirmation dialog (writeSap === true)
      if (writeSap !== false && toLoc) {
        try {
          let targetLocation: PlantLocationTarget | null = null;

          // Prefer codes stored at creation — works even when destination has no vehicles yet in SAP feed
          if (gatePass.toPlantCode && gatePass.toStorageLocation) {
            targetLocation = {
              plantCode: gatePass.toPlantCode,
              plantDescription: gatePass.toLocation ?? "",
              storageLocation: gatePass.toStorageLocation,
              storageDescription: "",
            };
          } else {
            // Legacy fallback: description-string lookup (only succeeds if location is in live SAP feed or LocationOption table)
            const plantOptions = await fetchPlantLocationOptions().catch(() => []);
            targetLocation = findPlantLocationOption(plantOptions, toLoc);
            if (!targetLocation) {
              const dbLocations = await prisma.locationOption.findMany({ orderBy: { plantCode: "asc" } });
              targetLocation = findPlantLocationOption(
                dbLocations.map((l) => ({
                  plantCode: l.plantCode,
                  plantDescription: l.plantDescription,
                  storageLocation: l.storageLocation,
                  storageDescription: l.storageDescription,
                })),
                toLoc
              );
            }
          }

          if (targetLocation) {
            printLiveUpdate = await updateVehiclePlantLocation({
              identifiers: [gatePass.vehicle, gatePass.chassis],
              destination: targetLocation,
              sapFallback: { internalNo: (gatePass as any).sapVehicleId, externalNo: gatePass.vehicle, chassisNo: gatePass.chassis },
            });
            console.log("[print_gate_out] SAP location updated:", printLiveUpdate.message);
          } else {
            printLiveUpdateError = `SAP location not resolved for "${toLoc}" — no matching plant/sloc found. This pass was likely created before the latest fix and has no stored plant/sloc codes.`;
            console.warn("[print_gate_out] no matching SAP plant location for:", toLoc);
          }
        } catch (error) {
          printLiveUpdateError = error instanceof Error ? error.message : "Vehicle location API update failed.";
          console.error("[print_gate_out] SAP location update failed:", error);
        }
      }
    }

    // Test Drive: no SAP write, no destination transfer — just notify Security Officers
    // and Initiators at the same plant that the vehicle is out and awaiting return confirmation.
    if (gatePass.passType === "TEST_DRIVE" && gatePass.fromLocation) {
      const plantWhere = { defaultLocation: ciStartsWithPlant(gatePass.fromLocation) };
      const [tdSecurity, tdInitiators] = await Promise.all([
        prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...plantWhere } }),
        prisma.user.findMany({ where: { role: "INITIATOR", ...plantWhere } }),
      ]);
      const tdRecipients = [...new Map([...tdSecurity, ...tdInitiators].map((u) => [u.id, u])).values()];
      if (tdRecipients.length > 0) {
        await prisma.notification.createMany({
          data: tdRecipients.map((u) => ({
            userId: u.id,
            type: "GATE_PASS_RECEIVED",
            title: "Test Drive Vehicle Out — Awaiting Return",
            message: `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle left for a Test Drive. Check Vehicle Arrivals to confirm when it returns.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated, liveLocationUpdate: printLiveUpdate, liveLocationUpdateError: printLiveUpdateError });
  }

  if (action === "gate_out") {
    const canGateOut = session.user.role === "INITIATOR" || session.user.role === "AREA_SALES_OFFICER";
    if (!canGateOut) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ASO-created Location Transfer: "Vehicle Go" slider
    // Allowed by the creator OR the requestedBy person (if they are an ASO/INITIATOR in the app)
    if (gatePass.passType === "LOCATION_TRANSFER" && gatePass.asoCreated) {
      const isCreator = gatePass.createdById === session.user.id;
      const isRequestedBy =
        gatePass.requestedByEmail &&
        session.user.email === gatePass.requestedByEmail &&
        ["AREA_SALES_OFFICER", "INITIATOR"].includes(session.user.role ?? "");

      if (!isCreator && !isRequestedBy) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (gatePass.status !== "APPROVED") {
        return NextResponse.json({ error: "Gate pass must be APPROVED before release" }, { status: 400 });
      }

      const now = new Date();
      const departureDate = now.toISOString().split("T")[0];
      const departureTime = now.toTimeString().slice(0, 5);

      const updated = await prisma.gatePass.update({
        where: { id },
        data: { status: "GATE_OUT", departureDate, departureTime, gateOutBy: session.user.name ?? null },
      });

      // SAP write — uses toPlantCode + toStorageLocation
      let liveLocationUpdate: { message: string; currentLocation: { label: string; plantCode: string; storageLocation: string } } | null = null;
      let liveLocationUpdateError: string | null = null;
      if (writeSap !== false && gatePass.toPlantCode && gatePass.toStorageLocation) {
        try {
          const targetLocation: PlantLocationTarget = {
            plantCode: gatePass.toPlantCode,
            plantDescription: gatePass.toLocation ?? "",
            storageLocation: gatePass.toStorageLocation,
            storageDescription: "",
          };
          liveLocationUpdate = await updateVehiclePlantLocation({
            identifiers: [gatePass.vehicle, gatePass.chassis],
            destination: targetLocation,
            sapFallback: { internalNo: gatePass.sapVehicleId, externalNo: gatePass.vehicle, chassisNo: gatePass.chassis },
          });
          console.log("[gate_out ASO LT] SAP location updated:", liveLocationUpdate.message);
        } catch (error) {
          liveLocationUpdateError = error instanceof Error ? error.message : "SAP location update failed.";
          console.error("[gate_out ASO LT] SAP location update failed:", error);
        }
      }

      // Notify creator + requestedBy person + destination ASOs/initiators
      const notifyMap = new Map<string, { title: string; message: string }>();
      const baseMsg = `Gate pass ${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle released to ${gatePass.toLocation ?? "destination"}.`;

      notifyMap.set(gatePass.createdById, {
        title: "Vehicle Released — Gate Out Confirmed",
        message: baseMsg,
      });

      // Notify requestedBy person if they are an app user
      if (gatePass.requestedByEmail) {
        const rbUser = await prisma.user.findUnique({ where: { email: gatePass.requestedByEmail }, select: { id: true } });
        if (rbUser && rbUser.id !== gatePass.createdById) {
          notifyMap.set(rbUser.id, { title: "Vehicle Released — Gate Out Confirmed", message: baseMsg });
        }
      }

      // Notify destination SO, ASOs and initiators
      if (gatePass.toLocation) {
        const destUsers = await prisma.user.findMany({
          where: {
            role: { in: ["SECURITY_OFFICER", "AREA_SALES_OFFICER", "INITIATOR"] as any[] },
            defaultLocation: ciStartsWithPlant(gatePass.toLocation),
          },
          select: { id: true, role: true },
        });
        for (const u of destUsers) {
          if (!notifyMap.has(u.id)) {
            const isSO = u.role === "SECURITY_OFFICER";
            notifyMap.set(u.id, {
              title: isSO
                ? "Incoming Vehicle — Confirm Gate IN on Arrival"
                : "Incoming Vehicle — Confirm Arrival",
              message: isSO
                ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle released and en route to ${gatePass.toLocation}. Please confirm Gate IN when it arrives.`
                : `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle is heading to ${gatePass.toLocation}. Open your dashboard to confirm when it arrives.`,
            });
          }
        }
      }

      if (notifyMap.size > 0) {
        await prisma.notification.createMany({
          data: Array.from(notifyMap.entries()).map(([userId, n]) => ({
            userId,
            type: "GATE_PASS_RECEIVED",
            title: n.title,
            message: n.message,
            gatePassId: gatePass.id,
          })),
        });
      }

      return NextResponse.json({ gatePass: updated, liveLocationUpdate, liveLocationUpdateError });
    }

    if (gatePass.createdById !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (gatePass.status !== "APPROVED") {
      return NextResponse.json({ error: "Gate pass must be approved first" }, { status: 400 });
    }
    // MAIN_OUT, LOCATION_TRANSFER (non-ASO), and CUSTOMER_DELIVERY must go through Security Officer
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
      const sourceSOs = await findSOsAtSamePlant(fromLoc);
      const bypassSourceSecurity = true;

      if (!bypassSourceSecurity && sourceSOs.length > 0) {
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
        const asoPlantFilter = toLoc ? { defaultLocation: ciStartsWithPlant(toLoc) } : {};
        const [destSOs, destInitiators, destASOs] = await Promise.all([
          prisma.user.findMany({ where: { role: "SECURITY_OFFICER" as any, ...destFilter } }),
          prisma.user.findMany({ where: { role: "INITIATOR", ...destFilter } }),
          prisma.user.findMany({ where: { role: "AREA_SALES_OFFICER" as any, ...asoPlantFilter } }),
        ]);
        const allDest = [...destSOs, ...destInitiators, ...destASOs];
        if (allDest.length > 0) {
          const destSOIds  = new Set(destSOs.map((s: { id: string }) => s.id));
          const destASOIds = new Set(destASOs.map((a: { id: string }) => a.id));
          await prisma.notification.createMany({
            data: allDest.map((u: { id: string }) => ({
              userId: u.id,
              type: destSOIds.has(u.id) ? "GATE_PASS_APPROVED" : "GATE_PASS_RECEIVED",
              title: destSOIds.has(u.id)
                ? "Incoming Vehicle — Confirm Gate IN on Arrival"
                : destASOIds.has(u.id)
                ? "Vehicle Heading Your Way — Confirm Sub IN on Arrival"
                : "Vehicle Arriving — Check Vehicle Arrivals",
              message: destSOIds.has(u.id)
                ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle en route from ${fromLoc ?? "source"}. No source gate security. Please confirm Gate IN on arrival.`
                : destASOIds.has(u.id)
                ? `${gatePass.gatePassNumber} (${gatePass.vehicle}) — vehicle is heading to ${toLoc ?? "your location"}. Open your dashboard to confirm when it arrives.`
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
    // INITIATOR can confirm gate_in for LT passes heading to their location, AFTER_SALES, and TEST_DRIVE
    const initiatorAllowed = session.user.role === "INITIATOR"
      && (gatePass.passType === "LOCATION_TRANSFER" || gatePass.passType === "AFTER_SALES" || gatePass.passType === "TEST_DRIVE");
    const asoAllowed = session.user.role === "AREA_SALES_OFFICER"
      && (gatePass.passType === "AFTER_SALES" || gatePass.passType === "LOCATION_TRANSFER");
    const canGateIn = recipientAllowed
      || initiatorAllowed
      || asoAllowed;
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
        gateInBy: session.user.name ?? null,
        ...(receivedChassis ? { chassis: receivedChassis } : {}),
        ...(mismatchNote ? { comments: `[MISMATCH] ${mismatchNote}` } : {}),
      },
    });

    // LT Return Gate Pass: unlock the linked return pass now that the original has completed.
    if (gatePass.passType === "LOCATION_TRANSFER") {
      await prisma.gatePass.updateMany({
        where: { parentPassId: gatePass.id, returnPassLocked: true },
        data: { returnPassLocked: false },
      });
    }

    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_RECEIVED",
        title: "Vehicle Received",
        message: `Gate pass ${gatePass.gatePassNumber} confirmed received.${mismatch ? " A details mismatch was noted." : ""}`,
        gatePassId: gatePass.id,
      },
    });

    // SAP location is already updated at Gate OUT (print_gate_out or security_gate_out).
    // gate_in is application-only — marks the pass COMPLETED in our system; no SAP write here.

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

    // LT: notify ASOs at fromLocation (source) that vehicle has arrived at destination
    if (gatePass.passType === "LOCATION_TRANSFER" && gatePass.fromLocation) {
      const fromAsoFilter = ciStartsWithPlant(gatePass.fromLocation as string);
      if (fromAsoFilter) {
        const fromAsos = await prisma.user.findMany({
          where: { role: "AREA_SALES_OFFICER" as any, defaultLocation: fromAsoFilter },
          select: { id: true, email: true, name: true },
        });
        if (fromAsos.length > 0) {
          const confirmedByRole = session.user.role === "SECURITY_OFFICER" ? "Security Officer"
            : session.user.role === "AREA_SALES_OFFICER" ? "Area Sales Officer"
            : "Initiator";
          const confirmedByName = session.user.name ?? confirmedByRole;
          await prisma.notification.createMany({
            data: fromAsos.map((aso: { id: string }) => ({
              userId: aso.id,
              type: "GATE_PASS_RECEIVED",
              title: "Vehicle Arrived at Destination",
              message: `${gatePass.gatePassNumber} (${gatePass.vehicle ?? ""}) — ${confirmedByName} (${confirmedByRole}) at ${gatePass.toLocation ?? "destination"} confirmed Gate IN. Vehicle transferred from ${gatePass.fromLocation} to ${gatePass.toLocation ?? "destination"}.`,
              gatePassId: gatePass.id,
            })),
          });
          const { sendAsoArrivalEmail } = await import("@/lib/email");
          for (const aso of fromAsos) {
            sendAsoArrivalEmail(aso.email, aso.name ?? "ASO", id, {
              gatePassNumber: gatePass.gatePassNumber,
              vehicle: gatePass.vehicle ?? "",
              chassis: gatePass.chassis,
              fromLocation: gatePass.fromLocation as string,
              toLocation: gatePass.toLocation as string | null,
              confirmedByName,
              confirmedByRole,
            }).catch((e: unknown) => console.error("[email] ASO arrival notification (gate_in) failed:", e));
          }
        }
      }
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
    const isCdCashierReviewEdit = gatePass.passType === "CUSTOMER_DELIVERY" && gatePass.status === "CASHIER_REVIEW";
    if (gatePass.status !== "REJECTED" && !isCdCashierReviewEdit) {
      return NextResponse.json({ error: "Only rejected passes can be resubmitted" }, { status: 400 });
    }

    const {
      resubmitNote,
      // All editable fields — initiator can correct any data before resubmitting
      vehicle, chassis, make, vehicleColor,
      toLocation, toPlantCode, toStorageLocation, fromLocation, outReason,
      approver,
      departureDate, departureTime, arrivalDate, arrivalTime,
      transportMode, carrierName, carrierRegNo, companyName,
      driverName, driverNIC, driverContact,
      mileage, insurance, garagePlate,
      remarks,
      requestedBy,
    } = body;

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        // CD CASHIER_REVIEW edits stay in CASHIER_REVIEW — service orders already fetched, only form fields change
        status: isCdCashierReviewEdit ? "CASHIER_REVIEW" : "PENDING_APPROVAL",
        resubmitCount: (gatePass.resubmitCount ?? 0) + 1,
        resubmitNote: resubmitNote || null,
        ...(vehicle        ? { vehicle }        : {}),
        ...(chassis        !== undefined ? { chassis }        : {}),
        ...(make           !== undefined ? { make }           : {}),
        ...(vehicleColor   !== undefined ? { vehicleColor }   : {}),
        ...(toLocation         ? { toLocation }         : {}),
        ...(toPlantCode        !== undefined ? { toPlantCode:        toPlantCode        || null } : {}),
        ...(toStorageLocation  !== undefined ? { toStorageLocation:  toStorageLocation  || null } : {}),
        ...(fromLocation       !== undefined ? { fromLocation }      : {}),
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
        ...(remarks        !== undefined ? { remarks }        : {}),
        ...(requestedBy    !== undefined ? { requestedBy }    : {}),
        ...(approver !== undefined ? { intendedApprover: (typeof approver === "string" ? approver.trim() || null : null) } : {}),
      },
    });

    // CD CASHIER_REVIEW edit: notify cashier of updated details, skip approver notifications
    if (isCdCashierReviewEdit) {
      const plantPrefix = gatePass.fromLocation ? gatePass.fromLocation.split(" - ")[0].trim() : null;
      const cashiers = plantPrefix
        ? await prisma.user.findMany({ where: { role: "CASHIER" as any, defaultLocation: { startsWith: plantPrefix, mode: "insensitive" as const } } })
        : await prisma.user.findMany({ where: { role: "CASHIER" as any } });
      if (cashiers.length > 0) {
        await prisma.notification.createMany({
          data: cashiers.map((c: { id: string }) => ({
            userId: c.id,
            type: "GATE_PASS_SUBMITTED",
            title: "CD Pass Updated by Initiator",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — the initiator updated the pass details. Please review before proceeding.`,
            gatePassId: gatePass.id,
          })),
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Notify only the (possibly new) intended approver + admins
    const newIntendedApprover = (typeof approver === "string" ? approver.trim() : null) || gatePass.intendedApprover;
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
    // CD: use same simple name-match lookup as initial submission (avoids brand-filter miss)
    // LT and all other pass types: unchanged — still use findApproversForLocationBrand
    let targetApprovers;
    if (gatePass.passType === "CUSTOMER_DELIVERY") {
      targetApprovers = newIntendedApprover
        ? await prisma.user.findMany({ where: { role: "APPROVER", name: { equals: newIntendedApprover, mode: "insensitive" } } })
        : await prisma.user.findMany({ where: { role: "APPROVER" } });
      if (newIntendedApprover && targetApprovers.length === 0) {
        targetApprovers = await prisma.user.findMany({ where: { role: "APPROVER" } });
      }
    } else {
      targetApprovers = await findApproversForLocationBrand(gatePass.fromLocation, newIntendedApprover ?? undefined, gatePass.make);
    }
    const resubmitRecipients = [...targetApprovers, ...admins];
    if (resubmitRecipients.length > 0) {
      await prisma.notification.createMany({
        data: resubmitRecipients.map((a) => ({
          userId: a.id,
          type: "GATE_PASS_RESUBMITTED",
          title: "Gate Pass Resubmitted",
          message: `Gate pass ${gatePass.gatePassNumber} was resubmitted after rejection and needs your review.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    // Send approval request email to approvers (same as initial submission)
    if (targetApprovers.length > 0) {
      const { sendApprovalRequestEmail } = await import("@/lib/email");
      const emailPassData = {
        gatePassNumber: updated.gatePassNumber,
        passType: updated.passType,
        passSubType: updated.passSubType,
        vehicle: updated.vehicle ?? "",
        chassis: updated.chassis,
        toLocation: updated.toLocation,
        fromLocation: updated.fromLocation,
        departureDate: updated.departureDate,
        departureTime: updated.departureTime,
        createdByName: session.user.name || "Initiator",
      };
      for (const approverUser of targetApprovers) {
        sendApprovalRequestEmail(approverUser.email, approverUser.name, id, emailPassData, approverUser.id)
          .catch((e: unknown) => console.error("[email] resubmit approval email failed:", e));
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // INITIATOR / AREA_SALES_OFFICER: cancel their own PENDING_APPROVAL pass
  if (action === "cancel") {
    if (session.user.role !== "INITIATOR" && session.user.role !== "ADMIN" && session.user.role !== "AREA_SALES_OFFICER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const isCdCashierReview = gatePass.passType === "CUSTOMER_DELIVERY" && gatePass.status === "CASHIER_REVIEW";
    // Cancellable up until the vehicle actually leaves: PENDING_APPROVAL, APPROVED (before
    // Security Gate Out / print), or the existing CD CASHIER_REVIEW exception.
    const cancellableStatuses = ["PENDING_APPROVAL", "APPROVED"];
    if (!cancellableStatuses.includes(gatePass.status) && !isCdCashierReview) {
      return NextResponse.json({ error: "This gate pass can no longer be cancelled — it has already been gated out." }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: "CANCELLED" as any },
    });

    // Notify + email the approver and the creator that this pass was cancelled.
    try {
      const creator = await prisma.user.findUnique({
        where: { id: gatePass.createdById },
        select: { id: true, name: true, email: true },
      });
      let approverUser: { id: string; name: string; email: string } | null = null;
      if (gatePass.approvedById) {
        approverUser = await prisma.user.findUnique({
          where: { id: gatePass.approvedById },
          select: { id: true, name: true, email: true },
        });
      } else if (gatePass.intendedApprover) {
        approverUser = await prisma.user.findFirst({
          where: { name: { equals: gatePass.intendedApprover, mode: "insensitive" } },
          select: { id: true, name: true, email: true },
        });
      }

      const recipients = [creator, approverUser].filter(
        (u): u is { id: string; name: string; email: string } => !!u
      );
      const uniqueRecipients = [...new Map(recipients.map((u) => [u.id, u])).values()];

      if (uniqueRecipients.length > 0) {
        await prisma.notification.createMany({
          data: uniqueRecipients.map((u) => ({
            userId: u.id,
            type: "GATE_PASS_CANCELLED",
            title: "Gate Pass Cancelled",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) was cancelled by ${session.user.name ?? "the initiator"}.`,
            gatePassId: gatePass.id,
          })),
        });
      }

      const { sendGatePassCancelledEmail } = await import("@/lib/email");
      for (const u of uniqueRecipients) {
        sendGatePassCancelledEmail(u.email, u.name, {
          gatePassNumber: gatePass.gatePassNumber,
          passId: gatePass.id,
          vehicle: gatePass.vehicle,
          cancelledByName: session.user.name ?? "the initiator",
        }).catch((e: unknown) => console.error("[email] Gate Pass Cancelled notification failed:", e));
      }
    } catch (e) {
      console.error("[cancel] notify approver/creator failed:", e);
    }

    // Notify cashiers when a CD pass in CASHIER_REVIEW is cancelled
    if (isCdCashierReview) {
      const plantPrefix = gatePass.fromLocation ? gatePass.fromLocation.split(" - ")[0].trim() : null;
      const cashiers = plantPrefix
        ? await prisma.user.findMany({ where: { role: "CASHIER" as any, defaultLocation: { startsWith: plantPrefix, mode: "insensitive" as const } } })
        : await prisma.user.findMany({ where: { role: "CASHIER" as any } });
      if (cashiers.length > 0) {
        await prisma.notification.createMany({
          data: cashiers.map((c: { id: string }) => ({
            userId: c.id,
            type: "GATE_PASS_REJECTED",
            title: "CD Pass Cancelled",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — the initiator cancelled this Customer Delivery. No further action needed.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ gatePass: updated });
  }

  // CASHIER: request payment override from their assigned approver
  if (action === "cashier_override_request") {
    if (session.user.role !== "CASHIER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "CASHIER_REVIEW" || !gatePass.hasImmediate || gatePass.cashierCleared) {
      return NextResponse.json({ error: "Pass is not eligible for override request" }, { status: 400 });
    }
    if ((gatePass as any).cashierOverrideRequested) {
      return NextResponse.json({ error: "Override already requested" }, { status: 400 });
    }

    const approverId: string | undefined = body.approverId;
    if (!approverId) return NextResponse.json({ error: "approverId is required" }, { status: 400 });

    const approverUser = await prisma.user.findUnique({ where: { id: approverId }, select: { id: true, name: true, role: true } });
    if (!approverUser || approverUser.role !== "APPROVER") {
      return NextResponse.json({ error: "Selected user is not an approver" }, { status: 400 });
    }

    await prisma.gatePass.update({
      where: { id },
      data: { cashierOverrideRequested: true } as any,
    });

    const cashierName = session.user.name || "";

    await prisma.notification.create({
      data: {
        userId: approverId,
        type: "GATE_PASS_SUBMITTED",
        title: "Payment Override Requested — Action Required",
        message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — Cashier ${cashierName} has requested a payment override. Please review and approve if the vehicle can proceed to Gate OUT without full payment clearance.`,
        gatePassId: gatePass.id,
      },
    });

    // Also notify the pass creator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_SUBMITTED",
        title: "Payment Override Requested",
        message: `${gatePass.gatePassNumber} — The cashier has escalated the payment clearance to ${approverUser.name ?? "an approver"} for override approval. You will be notified when approved.`,
        gatePassId: gatePass.id,
      },
    });

    return NextResponse.json({ ok: true, cashierOverrideRequested: true });
  }

  // APPROVER / ADMIN: approve the cashier payment override → mark cleared → APPROVED
  if (action === "cashier_override_approve") {
    if (session.user.role !== "APPROVER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "CASHIER_REVIEW" || !(gatePass as any).cashierOverrideRequested) {
      return NextResponse.json({ error: "Pass is not eligible for override approval" }, { status: 400 });
    }

    const updated = await prisma.gatePass.update({
      where: { id },
      data: {
        status: "APPROVED",
        cashierCleared: true,
        approvedById: session.user.id,
        approvedAt: new Date(),
      } as any,
    });

    // Notify the pass creator (initiator)
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_APPROVED",
        title: "Payment Override Approved — Vehicle Ready for Gate OUT",
        message: `Gate pass ${gatePass.gatePassNumber} — the approver has overridden the payment clearance requirement. Security Officer will confirm Gate OUT.`,
        gatePassId: gatePass.id,
      },
    });

    // Notify Security Officers at fromLocation
    const fromLoc = gatePass.fromLocation as string | null;
    const secOfficers = await findSOsAtSamePlant(fromLoc);
    if (secOfficers.length > 0) {
      await prisma.notification.createMany({
        data: secOfficers.map((s: { id: string }) => ({
          userId: s.id,
          type: "GATE_PASS_APPROVED",
          title: "Payment Override — Vehicle Cleared for Gate OUT",
          message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — an approver has overridden the cashier payment clearance. Please confirm Gate OUT.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    return NextResponse.json({ gatePass: updated });
  }

  // CASHIER: escalate remaining unpaid orders to a selected approver
  if (action === "cashier_single_order_escalate") {
    if (session.user.role !== "CASHIER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "CASHIER_REVIEW" || !gatePass.hasImmediate || gatePass.cashierCleared) {
      return NextResponse.json({ error: "Pass is not eligible for escalation" }, { status: 400 });
    }
    if ((gatePass as any).singleOrderEscalated) {
      return NextResponse.json({ error: "Escalation already sent" }, { status: 400 });
    }

    const approverId: string | undefined = body.approverId;
    if (!approverId) return NextResponse.json({ error: "approverId is required" }, { status: 400 });

    const approverUser = await prisma.user.findUnique({ where: { id: approverId }, select: { id: true, name: true, role: true, email: true } });
    if (!approverUser || approverUser.role !== "APPROVER") {
      return NextResponse.json({ error: "Selected user is not an approver" }, { status: 400 });
    }

    // Any unpaid orders can be escalated (not just exactly 1)
    const allOrders = await prisma.serviceOrder.findMany({ where: { gatePassId: id } });
    const unpaidCount = allOrders.filter(o => !o.isAssigned).length;
    if (unpaidCount === 0) {
      return NextResponse.json({ error: "No unpaid orders to escalate — all orders are already cleared" }, { status: 400 });
    }
    const paidCount = allOrders.filter(o => o.isAssigned).length;

    await prisma.gatePass.update({
      where: { id },
      data: { singleOrderEscalated: true, singleOrderEscalatedApproverId: approverId } as any,
    });

    // Notify the selected approver
    await prisma.notification.create({
      data: {
        userId: approverId,
        type: "CASHIER_REVIEW_REQUIRED",
        title: "Payment Sign-off Required",
        message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — ${paidCount} of ${allOrders.length} orders cleared. ${unpaidCount} remaining order${unpaidCount !== 1 ? "s" : ""} require${unpaidCount === 1 ? "s" : ""} your sign-off before the vehicle can be released.`,
        gatePassId: gatePass.id,
      },
    });

    // Email the selected approver
    if (approverUser.email) {
      const { sendEscalationRequestEmail } = await import("@/lib/email");
      sendEscalationRequestEmail(approverUser.email, approverUser.name ?? "Approver", id, {
        gatePassNumber: gatePass.gatePassNumber,
        vehicle: gatePass.vehicle ?? "",
        chassis: gatePass.chassis,
        fromLocation: gatePass.fromLocation as string | null,
        toLocation: gatePass.toLocation as string | null,
        cashierName: session.user.name ?? "Cashier",
        paidCount,
        unpaidCount,
        totalCount: allOrders.length,
      }, approverUser.id).catch((e: unknown) => console.error("[email] escalation request email failed:", e));
    }

    // Notify initiator that escalation was sent
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_SUBMITTED",
        title: "Cashier Escalated to Approver",
        message: `Gate pass ${gatePass.gatePassNumber} — cashier has sent ${unpaidCount} unpaid order${unpaidCount !== 1 ? "s" : ""} to ${approverUser.name ?? "an approver"} for sign-off.`,
        gatePassId: gatePass.id,
      },
    });
    // Email initiator
    const escalateCreator = await prisma.user.findUnique({ where: { id: gatePass.createdById }, select: { email: true, name: true } });
    if (escalateCreator?.email) {
      const { sendEscalationInitiatorEmail } = await import("@/lib/email");
      sendEscalationInitiatorEmail(escalateCreator.email, escalateCreator.name ?? "Initiator", id, {
        gatePassNumber: gatePass.gatePassNumber,
        vehicle: gatePass.vehicle ?? "",
        chassis: gatePass.chassis,
        fromLocation: gatePass.fromLocation as string | null,
      }, "escalated", { approverName: approverUser.name ?? "Approver" })
        .catch((e: unknown) => console.error("[email] escalation initiator email failed:", e));
    }

    return NextResponse.json({ ok: true, singleOrderEscalated: true });
  }

  // APPROVER / ADMIN: approve the escalated orders
  if (action === "cashier_single_order_approve") {
    if (session.user.role !== "APPROVER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "CASHIER_REVIEW" || !(gatePass as any).singleOrderEscalated) {
      return NextResponse.json({ error: "Pass is not eligible for single-order approval" }, { status: 400 });
    }
    const assignedApproverId = (gatePass as any).singleOrderEscalatedApproverId;
    if (assignedApproverId && assignedApproverId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "You are not the assigned approver for this escalation" }, { status: 403 });
    }

    const isCustomerDelivery = gatePass.passType === "CUSTOMER_DELIVERY";

    if (isCustomerDelivery) {
      // Use executeRaw so the new escalationApproved column is set even if the
      // Prisma client was generated before the schema migration.
      await prisma.$executeRaw`UPDATE "GatePass" SET "escalationApproved" = true WHERE id = ${id}`;

      // Notify cashiers at this location
      const fromLocEsc = gatePass.fromLocation as string | null;
      const plantPrefixEsc = fromLocEsc ? fromLocEsc.split(" - ")[0].trim() : null;
      const cashierWhereEsc = plantPrefixEsc
        ? { role: "CASHIER" as any, defaultLocation: { startsWith: plantPrefixEsc } }
        : { role: "CASHIER" as any };
      const cashiersEsc = await prisma.user.findMany({ where: cashierWhereEsc });
      if (cashiersEsc.length > 0) {
        await prisma.notification.createMany({
          data: cashiersEsc.map((c: { id: string }) => ({
            userId: c.id,
            type: "GATE_PASS_APPROVED",
            title: "Approver Signed Off — Generate Invoice Now",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — ${session.user.name ?? "The approver"} has approved the remaining orders. Please open the pass and generate the invoice.`,
            gatePassId: gatePass.id,
          })),
        });
        // Email cashiers
        const { sendEscalationApprovedEmail } = await import("@/lib/email");
        for (const c of cashiersEsc as { id: string; email: string | null; name: string | null }[]) {
          if (c.email) {
            sendEscalationApprovedEmail(c.email, c.name ?? "Cashier", id, {
              gatePassNumber: gatePass.gatePassNumber,
              vehicle: gatePass.vehicle ?? "",
              chassis: gatePass.chassis,
              fromLocation: gatePass.fromLocation as string | null,
              approverName: session.user.name ?? "Approver",
            }).catch((e: unknown) => console.error("[email] escalation approved email failed:", e));
          }
        }
      }

      // Notify initiator
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_SUBMITTED",
          title: "Approver Signed Off — Awaiting Cashier Invoice",
          message: `Gate pass ${gatePass.gatePassNumber} — ${session.user.name ?? "Approver"} approved remaining orders. Cashier will now generate the invoice.`,
          gatePassId: gatePass.id,
        },
      });
      // Email initiator
      const approveCreator = await prisma.user.findUnique({ where: { id: gatePass.createdById }, select: { email: true, name: true } });
      if (approveCreator?.email) {
        const { sendEscalationInitiatorEmail } = await import("@/lib/email");
        sendEscalationInitiatorEmail(approveCreator.email, approveCreator.name ?? "Initiator", id, {
          gatePassNumber: gatePass.gatePassNumber,
          vehicle: gatePass.vehicle ?? "",
          chassis: gatePass.chassis,
          fromLocation: gatePass.fromLocation as string | null,
        }, "approved", { approverName: session.user.name ?? "Approver" })
          .catch((e: unknown) => console.error("[email] escalation initiator approve email failed:", e));
      }

      return NextResponse.json({ ok: true, status: "CASHIER_REVIEW", escalationApproved: true });
    }

    // For AFTER_SALES: existing behaviour — set cashierCleared, move to APPROVED if credit done
    const creditStillPending = gatePass.hasCredit && !gatePass.creditApproved;
    const newStatus = creditStillPending ? "CASHIER_REVIEW" : "APPROVED";

    await prisma.gatePass.update({
      where: { id },
      data: {
        cashierCleared: true,
        ...(newStatus === "APPROVED" ? { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date() } : {}),
      } as any,
    });

    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_APPROVED",
        title: creditStillPending ? "Order Approved — Credit Review Pending" : "Order Approved — Vehicle Ready for Gate OUT",
        message: `Gate pass ${gatePass.gatePassNumber} — the approver signed off on the remaining orders.${creditStillPending ? " Credit orders are still under review." : " Security Officer will confirm Gate OUT."}`,
        gatePassId: gatePass.id,
      },
    });

    if (newStatus === "APPROVED") {
      const fromLoc = gatePass.fromLocation as string | null;
      const secOfficers = await findSOsAtSamePlant(fromLoc);
      if (secOfficers.length > 0) {
        await prisma.notification.createMany({
          data: secOfficers.map((s: { id: string }) => ({
            userId: s.id,
            type: "GATE_PASS_APPROVED",
            title: "Orders Approved — Confirm Gate OUT",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — approver signed off on remaining orders. Please confirm Gate OUT.`,
            gatePassId: gatePass.id,
          })),
        });
      }
    }

    return NextResponse.json({ ok: true, status: newStatus });
  }

  // APPROVER / ADMIN: reject the escalated single-order sign-off
  if (action === "cashier_single_order_reject") {
    if (session.user.role !== "APPROVER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.status !== "CASHIER_REVIEW" || !(gatePass as any).singleOrderEscalated) {
      return NextResponse.json({ error: "Pass is not eligible for single-order rejection" }, { status: 400 });
    }
    const assignedApproverId = (gatePass as any).singleOrderEscalatedApproverId;
    if (assignedApproverId && assignedApproverId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "You are not the assigned approver for this escalation" }, { status: 403 });
    }

    const reason = rejectionReason || null;

    // Reset escalation flag — keep singleOrderEscalatedApproverId so initiator can resubmit to same approver
    await (prisma.gatePass as any).update({ where: { id }, data: { singleOrderEscalated: false } });
    // Store rejection reason via raw SQL (column post-dates last prisma generate; wrap so notification always fires)
    try {
      await prisma.$executeRaw`UPDATE "GatePass" SET "escalationRejectionReason" = ${reason} WHERE id = ${id}`;
    } catch { /* escalationRejectionReason column may not exist on older deployments */ }

    // Notify cashiers at this location
    const fromLocRej = gatePass.fromLocation as string | null;
    const plantPrefixRej = fromLocRej ? fromLocRej.split(" - ")[0].trim() : null;
    const cashierWhereRej = plantPrefixRej
      ? { role: "CASHIER" as any, defaultLocation: { startsWith: plantPrefixRej } }
      : { role: "CASHIER" as any };
    const cashiersRej = await prisma.user.findMany({ where: cashierWhereRej });
    if (cashiersRej.length > 0) {
      await prisma.notification.createMany({
        data: cashiersRej.map((c: { id: string }) => ({
          userId: c.id,
          type: "GATE_PASS_REJECTED",
          title: "Sign-off Rejected — Action Required",
          message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — ${session.user.name ?? "Approver"} rejected the order sign-off.${reason ? ` Reason: ${reason}` : ""} Please resolve the pending orders.`,
          gatePassId: gatePass.id,
        })),
      });
      // Email cashiers
      const { sendEscalationRejectedEmail } = await import("@/lib/email");
      for (const c of cashiersRej as { id: string; email: string | null; name: string | null }[]) {
        if (c.email) {
          sendEscalationRejectedEmail(c.email, c.name ?? "Cashier", id, {
            gatePassNumber: gatePass.gatePassNumber,
            vehicle: gatePass.vehicle ?? "",
            chassis: gatePass.chassis,
            fromLocation: gatePass.fromLocation as string | null,
            approverName: session.user.name ?? "Approver",
            rejectionReason: reason,
          }).catch((e: unknown) => console.error("[email] escalation rejected email failed:", e));
        }
      }
    }

    // Notify initiator
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_REJECTED",
        title: "Order Sign-off Rejected",
        message: `Gate pass ${gatePass.gatePassNumber} — the approver rejected the cashier's sign-off request.${reason ? ` Reason: ${reason}` : ""}`,
        gatePassId: gatePass.id,
      },
    });
    // Email initiator
    const rejectCreator = await prisma.user.findUnique({ where: { id: gatePass.createdById }, select: { email: true, name: true } });
    if (rejectCreator?.email) {
      const { sendEscalationInitiatorEmail } = await import("@/lib/email");
      sendEscalationInitiatorEmail(rejectCreator.email, rejectCreator.name ?? "Initiator", id, {
        gatePassNumber: gatePass.gatePassNumber,
        vehicle: gatePass.vehicle ?? "",
        chassis: gatePass.chassis,
        fromLocation: gatePass.fromLocation as string | null,
      }, "rejected", { approverName: session.user.name ?? "Approver", rejectionReason: reason })
        .catch((e: unknown) => console.error("[email] escalation initiator reject email failed:", e));
    }

    return NextResponse.json({ ok: true, status: "CASHIER_REVIEW" });
  }

  // INITIATOR: resubmit escalation after approver rejected it (same GP number, same approver)
  if (action === "initiator_resubmit_escalation") {
    if (session.user.role !== "INITIATOR" && session.user.role !== "SERVICE_ADVISOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.createdById !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Must have a stored rejection reason (i.e. was rejected before) and not already escalated
    const rejReason: { escalationRejectionReason: string | null }[] =
      await prisma.$queryRaw`SELECT "escalationRejectionReason" FROM "GatePass" WHERE id = ${id} LIMIT 1`;
    const storedReason = rejReason[0]?.escalationRejectionReason ?? null;
    if (!storedReason) {
      return NextResponse.json({ error: "No rejected escalation to resubmit" }, { status: 400 });
    }
    if ((gatePass as any).singleOrderEscalated) {
      return NextResponse.json({ error: "Escalation already in progress" }, { status: 400 });
    }
    // singleOrderEscalatedApproverId is preserved on rejection (not cleared), so it's always available here
    const approverId = (gatePass as any).singleOrderEscalatedApproverId
      ?? body.approverId as string | undefined;
    if (!approverId) {
      return NextResponse.json({ error: "No approver on record — contact cashier to re-escalate" }, { status: 400 });
    }

    // Re-escalate to the same approver; clear the rejection reason
    await (prisma.gatePass as any).update({ where: { id }, data: { singleOrderEscalated: true } });
    try {
      await prisma.$executeRaw`UPDATE "GatePass" SET "escalationRejectionReason" = null WHERE id = ${id}`;
    } catch { /* ignore */ }

    // Notify the approver
    const approverUser = await prisma.user.findUnique({ where: { id: approverId }, select: { id: true, name: true } });
    if (approverUser) {
      await prisma.notification.create({
        data: {
          userId: approverUser.id,
          type: "GATE_PASS_SUBMITTED",
          title: "Resubmitted — Single Order Sign-off Required",
          message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — the initiator has resubmitted the order sign-off request after your rejection. Please review again.`,
          gatePassId: gatePass.id,
        },
      });
    }

    // Notify initiator confirmation
    await prisma.notification.create({
      data: {
        userId: gatePass.createdById,
        type: "GATE_PASS_SUBMITTED",
        title: "Sign-off Resubmitted",
        message: `Gate pass ${gatePass.gatePassNumber} — your resubmission has been sent to ${approverUser?.name ?? "the approver"} for review.`,
        gatePassId: gatePass.id,
      },
    });

    return NextResponse.json({ ok: true, resubmitted: true });
  }

  // CASHIER: confirm receipt printed for CD — sets paymentType=INVOICED and notifies Initiator to print gate pass
  if (action === "cashier_confirm_receipt") {
    if (session.user.role !== "CASHIER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.passType !== "CUSTOMER_DELIVERY") {
      return NextResponse.json({ error: "cashier_confirm_receipt only valid for Customer Delivery" }, { status: 400 });
    }
    if (gatePass.status !== "APPROVED" || !gatePass.cashierCleared) {
      return NextResponse.json({ ok: true }); // not yet approved, silently ignore
    }
    const alreadyConfirmed = (gatePass as any).paymentType === "INVOICED";
    if (!alreadyConfirmed) {
      await prisma.gatePass.update({
        where: { id },
        data: { paymentType: "INVOICED" } as any,
      });
      await prisma.notification.create({
        data: {
          userId: gatePass.createdById,
          type: "GATE_PASS_APPROVED",
          title: "Receipt Confirmed — Print Gate Pass to Release Vehicle",
          message: `Gate pass ${gatePass.gatePassNumber} — cashier confirmed receipt. Please print the gate pass to complete the delivery.`,
          gatePassId: gatePass.id,
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // CASHIER: cancel a pending CD single-order escalation (payment received directly)
  if (action === "cashier_cancel_escalation") {
    if (session.user.role !== "CASHIER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (gatePass.passType !== "CUSTOMER_DELIVERY") {
      return NextResponse.json({ error: "Only valid for Customer Delivery" }, { status: 400 });
    }
    if (!(gatePass as any).singleOrderEscalated) {
      return NextResponse.json({ error: "No active escalation to cancel" }, { status: 400 });
    }

    await (prisma.gatePass as any).update({ where: { id }, data: { singleOrderEscalated: false } });

    const approverId = (gatePass as any).singleOrderEscalatedApproverId as string | null;
    if (approverId) {
      const approverUser = await prisma.user.findUnique({ where: { id: approverId }, select: { id: true, name: true } });
      if (approverUser) {
        await prisma.notification.create({
          data: {
            userId: approverUser.id,
            type: "GATE_PASS_REJECTED",
            title: "Escalation Cancelled by Cashier",
            message: `${gatePass.gatePassNumber} (${gatePass.vehicle}) — the cashier received payment directly and cancelled the sign-off request.`,
            gatePassId: gatePass.id,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
