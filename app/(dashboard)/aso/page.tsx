import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ASODashboardClient from "./ASODashboardClient";

export default async function ASOPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user.role ?? "").trim() !== "AREA_SALES_OFFICER") redirect("/");

  return <ASODashboardClient user={session.user} />;
}
