import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

// Additional plants a user can access data for, on top of their primary defaultLocation.
// Raw SQL throughout so this never depends on the Prisma client having been regenerated
// after the schema change (matches the existing defensive style in app/api/admin/users).

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { userId, plantName } = await req.json();
  const plant = typeof plantName === "string" ? plantName.trim() : "";
  if (!userId || !plant) return NextResponse.json({ error: "userId and plantName required" }, { status: 400 });

  try {
    await prisma.$executeRaw`
      INSERT INTO "UserPlantMapping" ("id", "userId", "plantName")
      VALUES (${randomUUID()}, ${userId}, ${plant})
      ON CONFLICT ("userId", "plantName") DO NOTHING
    `;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[admin/plant-mappings] add failed:", e);
    return NextResponse.json({ error: "Unable to add plant mapping right now. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { userId, plantName } = await req.json();
  const plant = typeof plantName === "string" ? plantName.trim() : "";
  if (!userId || !plant) return NextResponse.json({ error: "userId and plantName required" }, { status: 400 });

  try {
    await prisma.$executeRaw`
      DELETE FROM "UserPlantMapping" WHERE "userId" = ${userId} AND "plantName" = ${plant}
    `;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[admin/plant-mappings] remove failed:", e);
    return NextResponse.json({ error: "Unable to remove plant mapping right now. Please try again." }, { status: 500 });
  }
}
