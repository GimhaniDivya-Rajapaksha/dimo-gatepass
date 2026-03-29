import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { userId, role } = await req.json();
  const validRoles = ["INITIATOR", "APPROVER", "RECIPIENT", "ADMIN", "CASHIER", "AREA_SALES_OFFICER", "SECURITY_OFFICER", "SERVICE_ADVISOR"];
  if (!userId || !validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: userId }, data: { role: role as any } });
  return NextResponse.json({ success: true });
}
