import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/Sidebar";
import DashboardHeader from "@/components/ui/DashboardHeader";

export default async function GatePassLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden"><Sidebar user={session.user} role={session.user.role} /></div>
      <div className="flex-1 ml-64 print:ml-0 flex flex-col min-h-screen">
        <div className="print:hidden"><DashboardHeader user={session.user} /></div>
        <main className="flex-1 p-6 main-bg print:p-0 print:bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
