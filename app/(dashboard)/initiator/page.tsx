import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import InitiatorDashboardClient from "./InitiatorDashboardClient";

export default async function InitiatorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const allowedRoles = ["INITIATOR"];
  if (!allowedRoles.includes(session.user.role ?? "")) redirect("/");

  return <InitiatorDashboardClient user={session.user} />;
}
