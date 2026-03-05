import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ApproverDashboardClient from "./ApproverDashboardClient";

export default async function ApproverPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "APPROVER") redirect("/");

  return <ApproverDashboardClient user={session.user} />;
}
