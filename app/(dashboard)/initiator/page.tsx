import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import InitiatorDashboardClient from "./InitiatorDashboardClient";

export default async function InitiatorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "INITIATOR") redirect("/");

  return <InitiatorDashboardClient user={session.user} />;
}
