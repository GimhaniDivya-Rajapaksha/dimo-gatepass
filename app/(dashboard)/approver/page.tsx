import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isApproverRole } from "@/lib/roles";
import ApproverDashboardClient from "./ApproverDashboardClient";

export default async function ApproverPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!isApproverRole(session.user.role)) redirect("/");

  return <ApproverDashboardClient user={session.user} />;
}
