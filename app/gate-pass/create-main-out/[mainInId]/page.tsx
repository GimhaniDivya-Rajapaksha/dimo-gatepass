import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CreateMainOutClient from "./CreateMainOutClient";

export default async function CreateMainOutPage({ params }: { params: Promise<{ mainInId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "INITIATOR") redirect("/initiator");

  const { mainInId } = await params;

  const mainIn = await (prisma.gatePass.findUnique as any)({
    where: { id: mainInId },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!mainIn || mainIn.passType !== "AFTER_SALES" || mainIn.passSubType !== "MAIN_IN") {
    notFound();
  }
  if (mainIn.createdById !== session.user.id) redirect("/initiator");

  return <CreateMainOutClient mainIn={mainIn} user={session.user} />;
}
