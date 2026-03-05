"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

type GatePassDetail = {
  id: string; gatePassNumber: string; passType: string; status: string;
  vehicle: string; vehicleColor: string | null; chassis: string | null; make: string | null; shipmentId: string | null;
  toLocation: string | null; arrivalDate: string | null; arrivalTime: string | null;
  vehicleDetails: string | null; departureDate: string | null; departureTime: string | null;
  requestedBy: string | null; outReason: string | null; transportMode: string | null;
  companyName: string | null; carrierName: string | null; carrierRegNo: string | null;
  driverName: string | null; driverNIC: string | null; driverContact: string | null;
  mileage: string | null; insurance: string | null; garagePlate: string | null;
  comments: string | null; rejectionReason: string | null;
  createdBy: { name: string; email: string }; approvedBy: { name: string } | null;
  createdAt: string; approvedAt: string | null;
};

const statusCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",          bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",           bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",          bg: "#f5f3ff", color: "#5b21b6", dot: "#8b5cf6" },
  CANCELLED:        { label: "Cancelled",          bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
};

const colorDot: Record<string, string> = {
  Red: "#ef4444", White: "#e5e7eb", Blue: "#3b82f6", Black: "#1f2937", Silver: "#94a3b8",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border mb-4 overflow-hidden print:border-gray-300 print:mb-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="px-6 py-3 border-b print:bg-gray-50" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>{title}</h2>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-2.5 flex items-start gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs w-52 flex-shrink-0 pt-0.5" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{value || "-"}</span>
    </div>
  );
}

function GridField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: "var(--surface2)" }}>
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{value || "-"}</p>
    </div>
  );
}

export default function InitiatorGatePassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<GatePassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    fetch(`/api/gate-pass/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d.gatePass); setLoading(false); })
      .catch(() => { setError("Failed to load."); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (data && searchParams.get("print") === "1") {
      setTimeout(() => window.print(), 500);
    }
  }, [data, searchParams]);

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel this gate pass request?")) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) throw new Error("Failed");
      setCancelled(true);
      setTimeout(() => router.push("/gate-pass"), 2000);
    } catch {
      setCancelLoading(false);
      setError("Could not cancel. Please try again.");
    }
  }

  async function handleMarkAsOut() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_out" }),
      });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
      setTimeout(() => router.push("/initiator"), 2000);
    } catch {
      setActionLoading(false);
      setError("Action failed. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm" style={{ color: "var(--text-muted)" }}>{error}</p></div>;
  }

  if (done) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="text-center p-12 rounded-3xl border shadow-xl"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg"
            style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}
          >
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>Marked as Gate Out!</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Recipients have been notified. Redirecting...</p>
        </motion.div>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="text-center p-12 rounded-3xl border shadow-xl"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg"
            style={{ background: "linear-gradient(135deg,#6b7280,#4b5563)" }}
          >
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>Request Cancelled</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>The gate pass request has been cancelled. Redirecting...</p>
        </motion.div>
      </div>
    );
  }

  if (!data) return null;
  const sc = statusCfg[data.status] || statusCfg["PENDING_APPROVAL"];
  const isLT = data.passType === "LOCATION_TRANSFER";
  const canMarkOut = data.status === "APPROVED";
  const canCancel  = data.status === "PENDING_APPROVAL";
  const canPrint = ["APPROVED", "GATE_OUT", "COMPLETED"].includes(data.status);

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          * { color: black !important; background: white !important; border-color: #e5e7eb !important; }
          .print-header { display: flex !important; }
        }
      `}</style>

      <motion.div ref={printRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-4xl pb-10">

        {/* Print-only header */}
        <div className="hidden print:flex items-center justify-between mb-6 pb-4 border-b">
          <div>
            <h1 className="text-xl font-bold">DIMO Gate Pass System</h1>
            <p className="text-sm text-gray-500">Official Gate Out Pass</p>
          </div>
          <p className="text-sm text-gray-500">Printed: {new Date().toLocaleString()}</p>
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 mb-6 no-print">
          <button
            onClick={() => router.back()}
            className="mt-1 w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:shadow-sm"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Gate - Out Pass {data.gatePassNumber}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                {sc.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: "var(--text-muted)" }}>
              <span>Created by: <span className="font-semibold" style={{ color: "var(--text)" }}>{data.createdBy.name}</span></span>
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--border)" }} />
              <span>{new Date(data.createdAt).toLocaleString()}</span>
              <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                {isLT ? "Location Transfer" : "Customer Delivery"}
              </span>
            </div>
            {data.approvedBy && (
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Approved by: <span className="font-semibold" style={{ color: "#15803d" }}>{data.approvedBy.name}</span>
                {data.approvedAt && <> on {new Date(data.approvedAt).toLocaleString()}</>}
              </p>
            )}
            {data.status === "REJECTED" && data.rejectionReason && (
              <div className="mt-2 px-3 py-2 rounded-xl text-xs" style={{ background: "#fef2f2", color: "#991b1b" }}>
                Rejection reason: {data.rejectionReason}
              </div>
            )}
          </div>
        </div>

        {/* Vehicle Details */}
        <Section title="Vehicle Details">
          {data.shipmentId && (
            <div className="mb-3">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Shipment ID: </span>
              <span className="text-xs font-mono font-semibold" style={{ color: "var(--text)" }}>{data.shipmentId}</span>
            </div>
          )}
          <div className="rounded-xl border p-4 flex items-center justify-between" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
            <div>
              <p className="text-lg font-bold mb-1" style={{ color: "var(--text)" }}>{data.vehicle}</p>
              <div className="flex items-center gap-5 text-xs" style={{ color: "var(--text-muted)" }}>
                {data.chassis && <span>Chassis: <strong style={{ color: "var(--text)" }}>{data.chassis}</strong></span>}
                {data.make && <span>Make: <strong style={{ color: "var(--text)" }}>{data.make}</strong></span>}
              </div>
            </div>
            {data.vehicleColor && (
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{data.vehicleColor}</span>
                <div className="w-7 h-7 rounded-full shadow-md" style={{ background: colorDot[data.vehicleColor] || "#94a3b8", border: "2px solid var(--surface)" }} />
              </div>
            )}
          </div>
        </Section>

        {isLT && (
          <Section title="Location &amp; Schedule">
            <Field label="Receiving Location / Branch" value={data.toLocation} />
            <Field label="Estimated Arrival Date" value={data.arrivalDate} />
            <Field label="Estimated Arrival Time" value={data.arrivalTime} />
            {data.outReason && <Field label="Out Reason" value={data.outReason} />}
          </Section>
        )}

        {!isLT && (
          <Section title="Delivery Details">
            <Field label="Vehicle Details" value={data.vehicleDetails} />
            <Field label="Requested By" value={data.requestedBy} />
            <Field label="Departure Date" value={data.departureDate} />
            <Field label="Departure Time" value={data.departureTime} />
          </Section>
        )}

        <Section title="Transportation Details">
          {data.transportMode && (
            <div className="mb-3">
              <span className="text-xs px-2.5 py-1 rounded-md font-semibold uppercase" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                {data.transportMode} Transportation
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <GridField label="Company Name" value={data.companyName} />
            <GridField label="Carrier Name" value={data.carrierName} />
            <GridField label="Carrier Reg No" value={data.carrierRegNo} />
            <GridField label="Driver Name" value={data.driverName} />
            <GridField label="Driver NIC No" value={data.driverNIC} />
            <GridField label="Driver Contact" value={data.driverContact} />
          </div>
        </Section>

        <Section title="Additional Details">
          <Field label="Mileage (Km) / Meter Reading" value={data.mileage} />
          <Field label="Insurance Arrangements" value={data.insurance} />
          <Field label="Garage Plate / Trade Plate" value={data.garagePlate} />
        </Section>

        {data.comments && (
          <Section title="Comments">
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{data.comments}</p>
          </Section>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm no-print" style={{ background: "#fef2f2", color: "#991b1b" }}>{error}</div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-2 no-print">
          <button
            onClick={() => router.back()}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:shadow-sm"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            Back
          </button>
          <div className="flex items-center gap-3">
            {canCancel && (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleCancel}
                disabled={cancelLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 transition-all"
                style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444" }}
              >
                {cancelLoading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                Cancel Request
              </motion.button>
            )}
            {canPrint && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:shadow-sm"
                style={{ background: "var(--surface)", borderColor: "#10b981", color: "#10b981" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Gate Pass
              </button>
            )}
            {canMarkOut && (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleMarkAsOut}
                disabled={actionLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
              >
                {actionLoading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Mark as Out
              </motion.button>
            )}
          </div>
        </div>

      </motion.div>
    </>
  );
}
