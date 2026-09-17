import { redirect } from "next/navigation";
import Image from "next/image";
import { getMaintenanceStatus } from "@/lib/maintenance";

export default async function MaintenancePage() {
  const status = await getMaintenanceStatus();
  if (!status.enabled) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#05070d" }}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl">
        <Image
          src="/maintenance-sap-downtime.jpg"
          alt="Planned system downtime"
          width={1568}
          height={1072}
          className="w-full h-auto block"
          priority
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
