import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CreateSubOutInClient from "./CreateSubOutInClient";

export default async function CreateSubOutInPage({ params }: { params: Promise<{ subInId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "AREA_SALES_OFFICER") redirect("/aso");

  const { subInId } = await params;

  const subIn = await (prisma.gatePass.findUnique as any)({
    where: { id: subInId },
    include: {
      createdBy: { select: { id: true, name: true } },
      parentPass: { select: { id: true, gatePassNumber: true, serviceJobNo: true, toLocation: true } },
    },
  });

  if (!subIn || subIn.passType !== "AFTER_SALES" || subIn.passSubType !== "SUB_IN") {
    notFound();
  }

  return <CreateSubOutInClient subIn={subIn} user={session.user} />;
}
