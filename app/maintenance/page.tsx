import { getMaintenanceStatus } from "@/lib/maintenance";

// Deliberately does NOT redirect away when maintenance is off — that decision belongs solely
// to proxy.ts, which is what actually routes users here in the first place. A second,
// independent check here previously redirected back to "/" whenever it disagreed with the
// proxy's own read (e.g. a brief timing/cache mismatch between their separate executions),
// which caused a genuine infinite redirect loop (ERR_TOO_MANY_REDIRECTS) whenever the two
// checks landed on different answers a moment apart. Visiting this URL directly while
// maintenance is actually off is harmless — it just shows the page once, nothing breaks.
export default async function MaintenancePage() {
  const status = await getMaintenanceStatus();

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
