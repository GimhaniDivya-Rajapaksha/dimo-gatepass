import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pass = await prisma.gatePass.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      subPasses: {
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      parentPass: { select: { id: true, gatePassNumber: true, passSubType: true, status: true, toLocation: true } },
    },
  });

  if (!pass) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ pass });
}
