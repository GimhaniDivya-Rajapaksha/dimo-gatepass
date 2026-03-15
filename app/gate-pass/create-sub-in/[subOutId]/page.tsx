import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CreateSubInClient from "./CreateSubInClient";

export default async function CreateSubInPage({ params }: { params: Promise<{ subOutId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "AREA_SALES_OFFICER") redirect("/");

  const { subOutId } = await params;

  const subOut = await (prisma.gatePass.findUnique as any)({
    where: { id: subOutId },
    include: {
      createdBy: { select: { id: true, name: true } },
      parentPass: { select: { id: true, gatePassNumber: true, serviceJobNo: true, vehicle: true, chassis: true, make: true, vehicleColor: true, requestedBy: true } },
    },
  });

  if (!subOut || subOut.passType !== "AFTER_SALES" || subOut.passSubType !== "SUB_OUT") {
    notFound();
  }

  return <CreateSubInClient subOut={subOut} user={session.user} />;
}
