import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { getSapReconciliationRecipients } from "@/lib/sap-reconciliation-recipients";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAdmin(session: any) {
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const data = await getSapReconciliationRecipients();
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { name, email } = await req.json();
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanName || !cleanEmail) return NextResponse.json({ error: "name and email are required" }, { status: 400 });

  try {
    await prisma.$executeRaw`
      INSERT INTO "SapReconciliationRecipient" ("id", "name", "email")
      VALUES (${randomUUID()}, ${cleanName}, ${cleanEmail})
      ON CONFLICT ("email") DO NOTHING
    `;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[admin/sap-reconciliation-recipients] add failed:", e);
    return NextResponse.json({ error: "Unable to add recipient right now. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await prisma.$executeRaw`DELETE FROM "SapReconciliationRecipient" WHERE "id" = ${id}`;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[admin/sap-reconciliation-recipients] delete failed:", e);
    return NextResponse.json({ error: "Unable to remove recipient right now. Please try again." }, { status: 500 });
  }
}
