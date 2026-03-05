import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import RecipientDashboardClient from "./RecipientDashboardClient";

export default async function RecipientPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "RECIPIENT") redirect("/");

  return <RecipientDashboardClient user={session.user} />;
}
