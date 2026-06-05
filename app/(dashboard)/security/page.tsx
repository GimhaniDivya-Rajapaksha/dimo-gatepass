import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SecurityOfficerDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SECURITY_OFFICER") redirect("/login");
  redirect("/gate-pass/security-gate-out");
}
