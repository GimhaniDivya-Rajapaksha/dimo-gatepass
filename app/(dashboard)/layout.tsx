import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/Sidebar";
import DashboardHeader from "@/components/ui/DashboardHeader";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isSO = session.user.role === "SECURITY_OFFICER";

  return (
    <div className="flex min-h-screen">
      {!isSO && <Sidebar user={session.user} role={session.user.role} />}
      <div className={`flex-1 flex flex-col h-screen overflow-hidden ${isSO ? "" : "ml-64"}`}>
        <DashboardHeader user={session.user} />
        <main className="flex-1 p-6 main-bg overflow-y-auto flex flex-col" style={{ minHeight: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
