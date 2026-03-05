import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/Sidebar";
import DashboardHeader from "@/components/ui/DashboardHeader";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar user={session.user} role={session.user.role} />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <DashboardHeader user={session.user} />
        <main className="flex-1 p-6 main-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
