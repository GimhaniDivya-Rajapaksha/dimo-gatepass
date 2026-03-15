import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import CashierDashboardClient from "./CashierDashboardClient";

export default async function CashierPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "CASHIER") redirect("/");

  return <CashierDashboardClient user={session.user} />;
}
