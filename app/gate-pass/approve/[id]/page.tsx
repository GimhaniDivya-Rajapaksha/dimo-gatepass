"use client";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
  PENDING_APPROVAL: { label: "Approval Pending", bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",           bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",            bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",           bg: "#f5f3ff", color: "#5b21b6", dot: "#8b5cf6" },
  CASHIER_REVIEW:   { label: "Cashier Review",      bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
};

const colorDot: Record<string, string> = {
  Red: "#ef4444", White: "#e5e7eb", Blue: "#3b82f6", Black: "#1f2937", Silver: "#94a3b8",
};

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border mb-4 overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between px-6 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>{title}</h2>
        {action}
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

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
      />
    </div>
  );
}

export default function ApproverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<GatePassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [done, setDone] = useState<"approve" | "reject" | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Transport edit state
  const [editingTransport, setEditingTransport] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [transport, setTransport] = useState({
    transportMode: "", companyName: "", carrierName: "", carrierRegNo: "",
    driverName: "", driverNIC: "", driverContact: "",
  });

  useEffect(() => {
    fetch(`/api/gate-pass/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.gatePass);
        if (d.gatePass) {
          setTransport({
            transportMode: d.gatePass.transportMode || "",
            companyName:   d.gatePass.companyName   || "",
            carrierName:   d.gatePass.carrierName   || "",
            carrierRegNo:  d.gatePass.carrierRegNo  || "",
            driverName:    d.gatePass.driverName    || "",
            driverNIC:     d.gatePass.driverNIC     || "",
            driverContact: d.gatePass.driverContact || "",
          });
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load gate pass."); setLoading(false); });
  }, [id]);

  async function handleAction(action: "approve" | "reject") {
    if (action === "reject" && !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason: rejectReason }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowRejectModal(false);
      setDone(action);
      setTimeout(() => router.push("/gate-pass/approve"), 2200);
    } catch {
      setActionLoading(false);
      setError("Action failed. Please try again.");
    }
  }

  async function saveTransport() {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transport),
      });
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      setData(d.gatePass);
      setEditingTransport(false);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center p-12 rounded-3xl border shadow-xl"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg"
            style={{ background: done === "approve" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#ef4444,#dc2626)" }}
          >
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {done === "approve"
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />}
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
            {done === "approve" ? "Gate Pass Approved!" : "Gate Pass Rejected"}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Initiator has been notified. Redirecting...</p>
        </motion.div>
      </div>
    );
  }

  if (!data) return null;
  const sc = statusCfg[data.status] || statusCfg["PENDING_APPROVAL"];
  const isLT = data.passType === "LOCATION_TRANSFER";
  const isPending = data.status === "PENDING_APPROVAL";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-4xl pb-10">

      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
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
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Gate Pass {data.gatePassNumber}</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
              {sc.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: "var(--text-muted)" }}>
            <span>Created by: <span className="font-semibold" style={{ color: "var(--text)" }}>{data.createdBy.name}</span></span>
            <span className="w-1 h-1 rounded-full" style={{ background: "var(--border)" }} />
            <span>Created on: <span className="font-semibold" style={{ color: "var(--text)" }}>{new Date(data.createdAt).toLocaleString()}</span></span>
            <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              {isLT ? "Location Transfer" : "Customer Delivery"}
            </span>
          </div>
          {data.status === "REJECTED" && data.rejectionReason && (
            <div className="mt-2 px-3 py-2 rounded-xl text-xs" style={{ background: "#fef2f2", color: "#991b1b" }}>
              Rejection reason: {data.rejectionReason}
            </div>
          )}
          {data.status === "APPROVED" && data.approvedBy && (
            <div className="mt-2 px-3 py-2 rounded-xl text-xs inline-flex items-center gap-1.5" style={{ background: "#f0fdf4", color: "#15803d" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approved by {data.approvedBy.name}
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

      {/* Location Transfer: Location & Schedule */}
      {isLT && (
        <Section title="Location &amp; Schedule">
          <Field label="Receiving Location / Branch" value={data.toLocation} />
          <Field label="Estimated Arrival Date" value={data.arrivalDate} />
          <Field label="Estimated Arrival Time" value={data.arrivalTime} />
          {data.outReason && <Field label="Out Reason" value={data.outReason} />}
        </Section>
      )}

      {/* Customer Delivery: Delivery Details */}
      {!isLT && (
        <Section title="Delivery Details">
          <Field label="Vehicle Details" value={data.vehicleDetails} />
          <Field label="Requested By" value={data.requestedBy} />
          <Field label="Departure Date" value={data.departureDate} />
          <Field label="Departure Time" value={data.departureTime} />
        </Section>
      )}

      {/* Transportation Details - editable */}
      <Section
        title="Transportation Details"
        action={
          <button
            onClick={() => { setEditingTransport(!editingTransport); setError(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:shadow-sm"
            style={editingTransport
              ? { background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }
              : { background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" }
            }
          >
            {editingTransport ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </>
            )}
          </button>
        }
      >
        <AnimatePresence mode="wait">
          {editingTransport ? (
            <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}>
              <div className="mb-3">
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>Transport Mode</label>
                <select
                  value={transport.transportMode}
                  onChange={(e) => setTransport((t) => ({ ...t, transportMode: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  <option value="">Select mode</option>
                  <option value="SELF">Self</option>
                  <option value="CARRIER">Carrier</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditField label="Company Name" value={transport.companyName} onChange={(v) => setTransport((t) => ({ ...t, companyName: v }))} />
                <EditField label="Carrier Name" value={transport.carrierName} onChange={(v) => setTransport((t) => ({ ...t, carrierName: v }))} />
                <EditField label="Carrier Reg No" value={transport.carrierRegNo} onChange={(v) => setTransport((t) => ({ ...t, carrierRegNo: v }))} />
                <EditField label="Driver Name" value={transport.driverName} onChange={(v) => setTransport((t) => ({ ...t, driverName: v }))} />
                <EditField label="Driver NIC No" value={transport.driverNIC} onChange={(v) => setTransport((t) => ({ ...t, driverNIC: v }))} />
                <EditField label="Driver Contact" value={transport.driverContact} onChange={(v) => setTransport((t) => ({ ...t, driverContact: v }))} />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setEditingTransport(false)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold border"
                  style={{ background: "var(--surface2)", color: "var(--text)", borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={saveTransport}
                  disabled={editSaving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 flex items-center gap-2"
                  style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                >
                  {editSaving && (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  Save Changes
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      {/* Additional Details */}
      <Section title="Additional Details">
        <Field label="Mileage (Km) / Meter Reading" value={data.mileage} />
        <Field label="Insurance Arrangements" value={data.insurance} />
        <Field label="Garage Plate / Trade Plate" value={data.garagePlate} />
      </Section>

      {/* Comments */}
      {data.comments && (
        <Section title="Comments">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{data.comments}</p>
        </Section>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: "#fef2f2", color: "#991b1b" }}>{error}</div>
      )}

      {/* Action Buttons - only for pending */}
      {isPending && (
        <div className="flex items-center justify-end gap-3 mt-2">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowRejectModal(true)}
            disabled={actionLoading}
            className="px-7 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50"
            style={{ background: "var(--surface)", color: "#ef4444", borderColor: "#fca5a5" }}
          >
            Reject
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => handleAction("approve")}
            disabled={actionLoading}
            className="px-7 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 flex items-center gap-2"
            style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
          >
            {actionLoading && (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            Approve
          </motion.button>
        </div>
      )}

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl border p-6 w-full max-w-sm shadow-2xl"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#fef2f2" }}>
                <svg className="w-6 h-6" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-center mb-1" style={{ color: "var(--text)" }}>Reject Gate Pass?</h3>
              <p className="text-sm text-center mb-4" style={{ color: "var(--text-muted)" }}>
                Please provide a reason for rejecting {data.gatePassNumber}.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4 resize-none"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
                  style={{ background: "var(--surface2)", color: "var(--text)", borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction("reject")}
                  disabled={!rejectReason.trim() || actionLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)" }}
                >
                  Yes, Reject
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
