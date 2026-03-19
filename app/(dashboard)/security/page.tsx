import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SecurityOfficerDashboardClient from "./SecurityOfficerDashboardClient";

export default async function SecurityOfficerDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SECURITY_OFFICER") redirect("/login");
  return (
    <SecurityOfficerDashboardClient
      user={{ name: session.user.name, email: session.user.email, role: session.user.role }}
    />
  );
}
