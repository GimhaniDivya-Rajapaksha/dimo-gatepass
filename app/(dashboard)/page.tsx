import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role === "INITIATOR") redirect("/initiator");
  if (role === "APPROVER") redirect("/approver");
  if (role === "RECIPIENT") redirect("/recipient");
  if (role === "CASHIER") redirect("/cashier");
  if (role === "AREA_SALES_OFFICER") redirect("/aso");
  if (role === "ADMIN") redirect("/admin");
  redirect("/login");
}
