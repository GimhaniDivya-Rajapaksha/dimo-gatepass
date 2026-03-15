"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

type SubIn = {
  id: string;
  gatePassNumber: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  vehicleColor: string | null;
  serviceJobNo: string | null;
  toLocation: string | null; // sub-location (ASO's location) — becomes fromLocation
  requestedBy: string | null;
  createdBy: { name: string };
  parentPass: {
    id: string;
    gatePassNumber: string;
    serviceJobNo: string | null;
  } | null;
};

interface Props {
  subIn: SubIn;
  user: { name?: string | null; role: string | null; defaultLocation?: string | null };
}

export default function CreateAsoMainOutClient({ subIn }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [toLocation, setToLocation] = useState("");
  const [departureDate, setDepartureDate] = useState(today);
  const [departureTime, setDepartureTime] = useState(
    new Date().toTimeString().slice(0, 5)
  );
  const [requestedBy, setRequestedBy] = useState(subIn.requestedBy ?? "");
  const [driverName, setDriverName] = useState("");
  const [carrierRegNo, setCarrierRegNo] = useState("");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toLocation.trim()) { setError("Customer destination is required."); return; }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/gate-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passType: "AFTER_SALES",
          passSubType: "MAIN_OUT",
          parentPassId: subIn.parentPass?.id || null,
          vehicle: subIn.vehicle,
          chassis: subIn.chassis || null,
          make: subIn.make || null,
          vehicleColor: subIn.vehicleColor || null,
          serviceJobNo: subIn.serviceJobNo || subIn.parentPass?.serviceJobNo || null,
          fromLocation: subIn.toLocation || null, // ASO sub-location
          toLocation: toLocation.trim(),
          requestedBy: requestedBy.trim() || null,
          driverName: driverName.trim() || null,
          carrierRegNo: carrierRegNo.trim() || null,
          departureDate,
          departureTime,
          comments: comments.trim() || null,
        }),
      });

      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to create MAIN OUT pass."); return; }

      router.push(`/gate-pass/${d.gatePass?.id ?? ""}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/aso" className="inline-flex items-center gap-1.5 text-sm mb-5 hover:underline"
        style={{ color: "var(--text-muted)" }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1" style={{ color: "var(--lime)" }}>After Sales</p>
        <h1 className="text-2xl font-bold gradient-text title-font">Customer Delivery (MAIN OUT)</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Direct customer delivery from sub-location. Linked to{" "}
          <span className="font-mono font-bold" style={{ color: "#1d4ed8" }}>{subIn.gatePassNumber}</span>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Vehicle reference */}
        <div className="rounded-xl border px-4 py-3" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#1d4ed8" }}>Vehicle</p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#dbeafe" }}>
              <svg className="w-4 h-4" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 8h4l3 3v5h-7V8z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{subIn.vehicle}</p>
              {subIn.chassis && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{subIn.chassis}</p>}
              {(subIn.make || subIn.vehicleColor) && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {[subIn.make, subIn.vehicleColor].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--text-muted)" }}>
            <span>Departing from:</span>
            <span className="font-semibold px-2 py-0.5 rounded-md"
              style={{ background: "#fef3c7", color: "#92400e" }}>
              {subIn.toLocation || "Sub-location"}
            </span>
            {(subIn.serviceJobNo || subIn.parentPass?.serviceJobNo) && (
              <span className="font-mono font-bold px-2 py-0.5 rounded-md"
                style={{ background: "#fef3c7", color: "#b45309" }}>
                Job: {subIn.serviceJobNo ?? subIn.parentPass?.serviceJobNo}
              </span>
            )}
          </div>
        </div>

        {/* Form fields */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Customer Delivery Details
            </p>
          </div>
          <div className="px-5 py-4 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                Customer / Destination <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                placeholder="e.g. Customer Name / Dealer Address"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                Requested By
              </label>
              <input
                type="text"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="Customer name"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Departure Date</label>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Departure Time</label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Driver <span className="font-normal opacity-60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Carrier Reg <span className="font-normal opacity-60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={carrierRegNo}
                  onChange={(e) => setCarrierRegNo(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                Comments <span className="font-normal opacity-60">(optional)</span>
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Any notes about this delivery..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border px-4 py-3 flex items-start gap-2.5"
          style={{ background: "#faf5ff", borderColor: "#d8b4fe" }}>
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#7c3aed" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs" style={{ color: "#5b21b6" }}>
            MAIN OUT will go to <strong>Cashier Review</strong> for payment confirmation before vehicle is released.
          </p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-xl border px-4 py-3" style={{ background: "#fee2e2", borderColor: "#fca5a5" }}>
            <p className="text-sm font-semibold" style={{ color: "#dc2626" }}>{error}</p>
          </motion.div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#5b21b6,#8b5cf6)" }}
        >
          {submitting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Creating…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              Issue MAIN OUT — Customer Delivery
            </>
          )}
        </button>
      </form>
    </div>
  );
}
