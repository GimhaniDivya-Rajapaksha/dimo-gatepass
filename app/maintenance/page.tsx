import { redirect } from "next/navigation";
import { getMaintenanceStatus } from "@/lib/maintenance";

export default async function MaintenancePage() {
  const status = await getMaintenanceStatus();
  if (!status.enabled) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#05070d" }}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/maintenance-sap-downtime.jpg"
          alt="Planned system downtime"
          className="w-full h-auto block"
        />
        {status.message && (
          <div className="px-6 py-4 text-center text-sm" style={{ background: "#0d1220", color: "#cbd5e1" }}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
