import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SECURITY_OFFICER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { passType, gateDirection, vehicle, chassis, make, vehicleColor, assignTo } = body;

    if (!vehicle?.trim()) return NextResponse.json({ error: "Vehicle number required" }, { status: 400 });
    if (!["LOCATION_TRANSFER", "CUSTOMER_DELIVERY", "AFTER_SALES"].includes(passType))
      return NextResponse.json({ error: "Invalid pass type" }, { status: 400 });
    if (!["IN", "OUT"].includes(gateDirection))
      return NextResponse.json({ error: "Gate direction must be IN or OUT" }, { status: 400 });

    const notifyRole: string = assignTo === "SERVICE_ADVISOR" ? "SERVICE_ADVISOR" : "INITIATOR";

    // Generate gate pass number
    const lastPass = await prisma.gatePass.findFirst({ orderBy: { gatePassNumber: "desc" } });
    const lastNum  = lastPass ? parseInt(lastPass.gatePassNumber.replace(/^GP-/, ""), 10) || 0 : 0;
    const gatePassNumber = `GP-${String(lastNum + 1).padStart(4, "0")}`;

    const fromLocation = (session.user as { defaultLocation?: string | null }).defaultLocation ?? null;
    const vehicleUpper = vehicle.trim().toUpperCase();

    // ── Step 1: create the pass with DRAFT status ──
    const gatePass = await (prisma.gatePass as any).create({
      data: {
        gatePassNumber,
        passType:     passType,
        status:       "DRAFT",
        vehicle:      vehicleUpper,
        chassis:      chassis   || null,
        make:         make      || null,
        vehicleColor: vehicleColor || null,
        fromLocation,
        createdById:  session.user.id,
      },
    });

    // ── Step 2: set new columns via raw SQL (securityCreated + gateDirection not in Prisma schema) ──
    await prisma.$executeRaw`
      UPDATE "GatePass"
      SET
        "securityCreated" = true,
        "gateDirection"   = ${gateDirection}
      WHERE id = ${gatePass.id}
    `;

    // ── Notify assigned role ──
    const recipients = await prisma.user.findMany({
      where: { role: notifyRole as any },
    });

    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((u: { id: string }) => ({
          userId:     u.id,
          type:       "GATE_PASS_SUBMITTED",
          title:      "Security Created Pass — Action Required",
          message:    `Security Officer created ${gatePassNumber} (${vehicleUpper}) as Gate ${gateDirection} · ${passType.replace(/_/g, " ")}. Please open and complete the details.`,
          gatePassId: gatePass.id,
        })),
      });
    }

    // Return with the corrected status so the UI shows DRAFT
    return NextResponse.json({ gatePass: { ...gatePass, status: "DRAFT", gateDirection, securityCreated: true } }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/gate-pass/security-draft]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
