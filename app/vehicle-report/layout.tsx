import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/Sidebar";
import DashboardHeader from "@/components/ui/DashboardHeader";
import SapDowntimeNotice from "@/components/ui/SapDowntimeNotice";
import { isSystemNoticeEnabled } from "@/lib/system-notice";

export default async function VehicleReportLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const showSystemNotice = await isSystemNoticeEnabled();

  return (
    <div className="flex min-h-screen">
      <Sidebar user={session.user} role={session.user.role} />
      <div className="flex-1 md:ml-64 flex flex-col" style={{ height: "100vh" }}>
        {showSystemNotice && <SapDowntimeNotice />}
        <DashboardHeader user={session.user} />
        <main className="flex-1 flex flex-col overflow-hidden p-6 main-bg">
          {children}
        </main>
        <footer
          className="flex-shrink-0 text-center text-xs py-2 px-4 border-t"
          style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
        >
          Powered by DIMO Group IT Digital Technologies &copy; 2026. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
