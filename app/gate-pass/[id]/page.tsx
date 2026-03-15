"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";

type SubPassSummary = {
  id: string; gatePassNumber: string; passSubType: string | null; status: string;
  toLocation: string | null; fromLocation: string | null; createdAt: string;
};

type GatePassDetail = {
  id: string; gatePassNumber: string; passType: string; status: string;
  passSubType: string | null; parentPassId: string | null; fromLocation: string | null;
  vehicle: string; vehicleColor: string | null; chassis: string | null; make: string | null; shipmentId: string | null;
  toLocation: string | null; arrivalDate: string | null; arrivalTime: string | null;
  vehicleDetails: string | null; departureDate: string | null; departureTime: string | null;
  requestedBy: string | null; outReason: string | null; transportMode: string | null;
  companyName: string | null; carrierName: string | null; carrierRegNo: string | null;
  driverName: string | null; driverNIC: string | null; driverContact: string | null;
  mileage: string | null; insurance: string | null; garagePlate: string | null;
  comments: string | null; rejectionReason: string | null;
  resubmitCount: number; resubmitNote: string | null;
  createdBy: { id: string; name: string; email: string }; approvedBy: { name: string } | null;
  createdAt: string; approvedAt: string | null;
  subPasses?: SubPassSummary[];
  parentPass?: { id: string; gatePassNumber: string; passSubType: string | null; status: string; toLocation: string | null } | null;
};

const statusCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",          bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",           bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",          bg: "#f5f3ff", color: "#5b21b6", dot: "#8b5cf6" },
  CANCELLED:        { label: "Cancelled",          bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
  CASHIER_REVIEW:   { label: "Cashier Review",      bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
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

  const { data: session } = useSession();
  const role = session?.user?.role;

  const [data, setData] = useState<GatePassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveResult, setApproveResult] = useState<"approved" | "rejected" | null>(null);
  const [showResubmitPanel, setShowResubmitPanel] = useState(false);
  const [resubmitNote, setResubmitNote] = useState("");
  const [resubmitDate, setResubmitDate] = useState("");
  const [resubmitTime, setResubmitTime] = useState("");
  const [resubmitLoading, setResubmitLoading] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);

  // Service orders — fetched for AFTER_SALES MAIN_OUT in PENDING_APPROVAL (approver review)
  type ServiceOrder = { id: string; orderId: string; orderStatus: string; payTerm: string; isAssigned: boolean };
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [serviceOrdersLoading, setServiceOrdersLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/gate-pass/${id}/sub-passes`)
      .then((r) => r.json())
      .then((d) => {
        if (d.pass) { setData(d.pass); setLoading(false); }
        else { setError("Failed to load."); setLoading(false); }
      })
      .catch(() => { setError("Failed to load."); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (data && searchParams.get("print") === "1") {
      setTimeout(() => window.print(), 500);
    }
  }, [data, searchParams]);

  // Fetch service orders for approver reviewing AFTER_SALES MAIN_OUT partial payment
  useEffect(() => {
    if (!data || data.passType !== "AFTER_SALES" || data.passSubType !== "MAIN_OUT" || data.status !== "PENDING_APPROVAL") return;
    setServiceOrdersLoading(true);
    fetch(`/api/service-orders?gatePassId=${data.id}`)
      .then((r) => r.ok ? r.json() : { orders: [] })
      .then((d) => setServiceOrders(d.orders ?? []))
      .catch(() => setServiceOrders([]))
      .finally(() => setServiceOrdersLoading(false));
  }, [data]);

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

  async function handleMarkAsIn() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_in" }),
      });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
      setTimeout(() => router.push("/initiator"), 2000);
    } catch {
      setActionLoading(false);
      setError("Action failed. Please try again.");
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

  async function handleApprove() {
    setApproveLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error("Failed");
      setApproveResult("approved");
      setTimeout(() => router.push("/gate-pass/approve"), 2000);
    } catch {
      setApproveLoading(false);
      setError("Could not approve. Please try again.");
    }
  }

  async function handleResubmit() {
    if (!resubmitNote.trim()) { setError("Please enter a note about what you fixed."); return; }
    setResubmitLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resubmit",
          resubmitNote,
          ...(resubmitDate ? { departureDate: resubmitDate } : {}),
          ...(resubmitTime ? { departureTime: resubmitTime } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setResubmitted(true);
      setTimeout(() => router.push("/gate-pass/rejected"), 2500);
    } catch {
      setResubmitLoading(false);
      setError("Could not resubmit. Please try again.");
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setError("Please enter a rejection reason."); return; }
    setRejectLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason }),
      });
      if (!res.ok) throw new Error("Failed");
      setApproveResult("rejected");
      setTimeout(() => router.push("/gate-pass/approve"), 2000);
    } catch {
      setRejectLoading(false);
      setError("Could not reject. Please try again.");
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
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>Action Completed!</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Status updated successfully. Redirecting...</p>
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

  if (resubmitted) {
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
            style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
          >
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>Resubmitted for Approval!</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>The approver has been notified. Redirecting...</p>
        </motion.div>
      </div>
    );
  }

  if (!data) return null;
  const rawSc = statusCfg[data.status] || statusCfg["PENDING_APPROVAL"];
  // For MAIN_IN/SUB_IN passes, GATE_OUT status means the vehicle came IN — show "Gate In" label
  const isInboundPass = ["MAIN_IN", "SUB_IN"].includes(data.passSubType ?? "");
  const sc = (data.status === "GATE_OUT" && isInboundPass)
    ? { ...rawSc, label: "Gate In" }
    : rawSc;
  const isLT = data.passType === "LOCATION_TRANSFER";
  const canCancel  = data.status === "PENDING_APPROVAL" && (role === "INITIATOR" || role === "AREA_SALES_OFFICER");
  const canPrint = ["APPROVED", "GATE_OUT", "COMPLETED"].includes(data.status);
  const isApproverView = role === "APPROVER" || role === "ADMIN";
  const isInitiatorView = role === "INITIATOR" || role === "AREA_SALES_OFFICER";
  const isASO = role === "AREA_SALES_OFFICER";
  const pendingApproval = data.status === "PENDING_APPROVAL";
  // Check if current user created this pass (to determine gate_out eligibility)
  const isCreator = data.createdBy.id === session?.user?.id || data.createdBy.email === session?.user?.email;
  // For AFTER_SALES APPROVED: can INITIATOR/ASO call gate_in directly? (SUB_IN and SUB_OUT_IN allow direct complete)
  const canDirectGateIn = data.passType === "AFTER_SALES"
    && ["SUB_IN", "SUB_OUT_IN"].includes(data.passSubType ?? "")
    && data.status === "APPROVED"
    && !isCreator
    && role === "INITIATOR";
  // MAIN_IN (Service/Repair) — vehicle arriving at DIMO, button label differs from outbound passes
  const isMainIn = data.passType === "AFTER_SALES" && data.passSubType === "MAIN_IN";
  const isRecipientView = role === "RECIPIENT";
  // RECIPIENT confirms at HQ gate: MAIN_IN (vehicle arriving), MAIN_OUT/SUB_OUT (vehicle departing)
  const isRecipientHQGate = isRecipientView && data.status === "GATE_OUT"
    && (isMainIn || data.passSubType === "MAIN_OUT" || data.passSubType === "SUB_OUT");
  const canRecipientGateIn = isRecipientHQGate;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          * { color: black !important; background: white !important; border-color: #d1d5db !important; }
          .print-show { display: block !important; }

          /* Gate pass document layout */
          .print-doc { max-width: 100% !important; padding: 0 !important; }
          .print-section { border: 1px solid #d1d5db !important; border-radius: 4px !important; margin-bottom: 10px !important; }
          .print-section-title { background: #f3f4f6 !important; padding: 6px 14px !important; font-size: 9pt !important; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-bottom: 1px solid #d1d5db !important; }
          .print-grid-field { background: #f9fafb !important; }

          /* Signature row */
          .print-sig { display: grid !important; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #d1d5db !important; }
          .print-sig-box { text-align: center; }
          .print-sig-line { border-bottom: 1px solid #374151 !important; height: 40px; margin-bottom: 6px; }
          .print-sig-label { font-size: 8pt; color: #6b7280 !important; }
        }
      `}</style>

      <motion.div ref={printRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-4xl pb-10 print-doc">

        {/* Print-only header */}
        <div className="hidden print:block mb-5">
          <div className="flex items-start justify-between pb-3 mb-4" style={{ borderBottom: "2px solid #0d1b3e" }}>
            <div>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "#0d1b3e", letterSpacing: "0.15em" }}>DIMO Gate Pass System</p>
              <h1 className="text-2xl font-bold mt-0.5" style={{ color: "#0d1b3e" }}>
                {isLT ? "Location Transfer" : data.passType === "AFTER_SALES" ? "After Sales" : "Customer Delivery"} — Gate Pass
              </h1>
            </div>
            <div className="text-right text-xs" style={{ color: "#6b7280" }}>
              <p className="font-bold text-base" style={{ color: "#0d1b3e" }}>{data.gatePassNumber}</p>
              <p>Status: {sc.label}</p>
              <p>Printed: {new Date().toLocaleString()}</p>
            </div>
          </div>
          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-3 text-xs mb-1">
            {[
              { l: "Created By", v: data.createdBy.name },
              { l: "Created At", v: new Date(data.createdAt).toLocaleDateString() },
              { l: "Approved By", v: data.approvedBy?.name || "—" },
              { l: "Approved At", v: data.approvedAt ? new Date(data.approvedAt).toLocaleDateString() : "—" },
            ].map(({ l, v }) => (
              <div key={l} className="rounded p-2" style={{ background: "#f3f4f6", border: "1px solid #e5e7eb" }}>
                <p style={{ color: "#6b7280", fontSize: "8pt", marginBottom: "2px" }}>{l}</p>
                <p className="font-semibold" style={{ color: "#111827" }}>{v}</p>
              </div>
            ))}
          </div>
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
            {/* Resubmission history banner — shown to approver when resubmitCount > 0 */}
            {isApproverView && data.resubmitCount > 0 && data.status === "PENDING_APPROVAL" && (
              <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: "#fcd34d" }}>
                <div className="px-3 py-2 flex items-start gap-2" style={{ background: "#fffbeb" }}>
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#d97706" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-xs font-bold" style={{ color: "#92400e" }}>
                      Resubmitted — Attempt #{data.resubmitCount + 1}
                    </p>
                    {data.rejectionReason && (
                      <p className="text-xs mt-0.5" style={{ color: "#92400e" }}>
                        Previous rejection: {data.rejectionReason}
                      </p>
                    )}
                    {data.resubmitNote && (
                      <p className="text-xs mt-1 font-medium" style={{ color: "#78350f" }}>
                        Initiator&apos;s note: {data.resubmitNote}
                      </p>
                    )}
                  </div>
                </div>
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

        {/* After Sales Journey Timeline */}
        {data.passSubType && (() => {
          // SUB_OUT_IN: vehicle returning from service center to main location.
          // From ASO's perspective it's "going OUT of service center" → Sub Gate OUT.
          // From INITIATOR's perspective it's "coming IN to their location" → Sub Gate IN.
          const subOutInLabel = isASO ? "Sub Gate OUT" : "Sub Gate IN";
          const subTypeCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
            MAIN_IN:    { label: "Main Gate IN",   bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
            SUB_OUT:    { label: "Sub Gate OUT",   bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
            SUB_IN:     { label: "Sub Gate IN",    bg: "#fffbeb", color: "#92400e", dot: "#f59e0b" },
            SUB_OUT_IN: { label: subOutInLabel,    bg: "#fdf4ff", color: "#7e22ce", dot: "#a855f7" },
            MAIN_OUT:   { label: "Main Gate OUT",  bg: "#f5f3ff", color: "#5b21b6", dot: "#8b5cf6" },
          };

          // Build the full journey: if this is a sub-pass, the parent is the root; otherwise this is root
          const rootPass = data.parentPass
            ? { id: data.parentPass.id, gatePassNumber: data.parentPass.gatePassNumber, passSubType: data.parentPass.passSubType, status: data.parentPass.status, toLocation: data.parentPass.toLocation, createdAt: "" }
            : { id: data.id, gatePassNumber: data.gatePassNumber, passSubType: data.passSubType, status: data.status, toLocation: data.toLocation, createdAt: data.createdAt };

          const subList: SubPassSummary[] = data.parentPass
            ? [{ id: data.id, gatePassNumber: data.gatePassNumber, passSubType: data.passSubType, status: data.status, toLocation: data.toLocation, fromLocation: data.fromLocation, createdAt: data.createdAt }]
            : (data.subPasses ?? []);

          const steps = [
            rootPass,
            ...subList,
          ];

          return (
            <Section title="After Sales Journey">
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-4 bottom-4 w-0.5" style={{ background: "var(--border)" }} />
                <div className="space-y-3 pl-10">
                  {steps.map((step, idx) => {
                    const cfg = step.passSubType ? subTypeCfg[step.passSubType] : { label: step.passSubType ?? "Unknown", bg: "var(--surface2)", color: "var(--text-muted)", dot: "#9ca3af" };
                    const isCurrent = step.id === data.id;
                    const isSubPending = !isCurrent && step.status === "PENDING_APPROVAL" && isApproverView;
                    const cardContent = (
                      <div className={`rounded-xl border px-4 py-3 transition-all ${!isCurrent ? "hover:shadow-sm" : ""}`}
                        style={{ background: isCurrent ? cfg.bg : "var(--surface2)", borderColor: isCurrent ? cfg.dot : isSubPending ? "#f97316" : "var(--border)", cursor: isCurrent ? "default" : "pointer" }}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: cfg.bg, color: cfg.color }}>
                              {cfg.label}
                            </span>
                            <span className="font-mono text-sm font-semibold" style={{ color: isCurrent ? cfg.color : "var(--text)" }}>
                              {step.gatePassNumber}
                            </span>
                            {isCurrent && <span className="text-xs font-semibold" style={{ color: cfg.color }}>(this pass)</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: step.status === "COMPLETED" ? "#f0fdf4" : step.status === "GATE_OUT" ? "#eff6ff" : step.status === "APPROVED" ? "#f0fdf4" : step.status === "PENDING_APPROVAL" ? "#fff7ed" : "var(--surface)", color: step.status === "COMPLETED" ? "#15803d" : step.status === "GATE_OUT" ? "#1d4ed8" : step.status === "APPROVED" ? "#15803d" : step.status === "PENDING_APPROVAL" ? "#c2410c" : "var(--text-muted)", border: "1px solid var(--border)" }}>
                              {step.status.replace(/_/g, " ")}
                            </span>
                            {/* Quick approve button for pending sub-passes (approver only) */}
                            {isSubPending && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/gate-pass/${step.id}`); }}
                                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold text-white transition-all hover:shadow-md"
                                style={{ background: "linear-gradient(135deg,#15803d,#22c55e)" }}
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Review
                              </button>
                            )}
                            {!isCurrent && !isSubPending && (
                              <svg className="w-3.5 h-3.5 opacity-40" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        {(step.toLocation || ("fromLocation" in step && (step as SubPassSummary).fromLocation)) && (
                          <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                            {"fromLocation" in step && (step as SubPassSummary).fromLocation && <><span className="font-medium">From:</span> {(step as SubPassSummary).fromLocation} → </>}
                            {step.toLocation && <><span className="font-medium">To:</span> {step.toLocation}</>}
                          </p>
                        )}
                        {step.createdAt && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {new Date(step.createdAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                    return (
                      <div key={step.id} className="relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-10 top-3 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                          style={{ background: cfg.dot, borderColor: isCurrent ? "var(--text)" : "var(--border)", boxShadow: isCurrent ? `0 0 0 3px ${cfg.dot}33` : "none" }} />
                        {/* Make non-current steps navigable */}
                        {!isCurrent
                          ? <div onClick={() => router.push(`/gate-pass/${step.id}`)}>{cardContent}</div>
                          : cardContent
                        }
                        {/* Connector arrow between steps */}
                        {idx < steps.length - 1 && (
                          <div className="flex items-center gap-1 my-1 pl-2">
                            <svg className="w-3 h-3" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Section>
          );
        })()}

        {/* Print-only signature area */}
        <div className="hidden print:block mt-6 pt-4" style={{ borderTop: "1px solid #d1d5db" }}>
          <div className="grid grid-cols-3 gap-8 text-xs">
            {["Prepared By / Initiator", "Authorized By / Approver", "Received By / Gate Officer"].map((label) => (
              <div key={label} className="text-center">
                <div style={{ height: "48px", borderBottom: "1px solid #374151", marginBottom: "6px" }} />
                <p style={{ color: "#6b7280", fontSize: "8pt" }}>{label}</p>
                <p style={{ color: "#9ca3af", fontSize: "7pt", marginTop: "2px" }}>Signature &amp; Date</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-4" style={{ color: "#9ca3af", fontSize: "7.5pt" }}>
            This is an official gate pass document of DIMO Gate Pass System. Printed on {new Date().toLocaleString()}.
          </p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm no-print" style={{ background: "#fef2f2", color: "#991b1b" }}>{error}</div>
        )}

        {/* Approve result flash */}
        {approveResult && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium no-print flex items-center gap-2"
            style={{ background: approveResult === "approved" ? "#f0fdf4" : "#fef2f2", color: approveResult === "approved" ? "#15803d" : "#991b1b" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={approveResult === "approved" ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
            </svg>
            {approveResult === "approved" ? "Gate pass approved successfully. Redirecting..." : "Gate pass rejected. Redirecting..."}
          </div>
        )}

        {/* Inline reject reason box */}
        {showRejectBox && (
          <div className="mb-4 p-4 rounded-2xl border no-print" style={{ background: "var(--surface)", borderColor: "#ef4444" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Rejection Reason</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              rows={3}
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-3"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowRejectBox(false); setRejectReason(""); setError(""); }}
                className="px-4 py-2 rounded-xl text-sm font-medium border"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                Cancel
              </button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleReject} disabled={rejectLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)" }}>
                {rejectLoading
                  ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                {rejectLoading ? "Rejecting..." : "Confirm Reject"}
              </motion.button>
            </div>
          </div>
        )}

        {/* Resubmit Panel — shown to initiator when pass is rejected */}
        {!isApproverView && data.status === "REJECTED" && !resubmitted && (
          <div className="mb-4 rounded-2xl border overflow-hidden no-print" style={{ borderColor: "#fca5a5" }}>
            {/* Header */}
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: "#fef2f2" }}>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-bold" style={{ color: "#991b1b" }}>
                This gate pass was rejected{data.resubmitCount > 0 ? ` (attempt #${data.resubmitCount + 1})` : ""}
              </span>
            </div>
            {/* Rejection reason */}
            {data.rejectionReason && (
              <div className="px-5 py-3 border-b" style={{ background: "var(--surface)", borderColor: "#fca5a5" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "#991b1b" }}>Rejection Reason</p>
                <p className="text-sm" style={{ color: "var(--text)" }}>{data.rejectionReason}</p>
              </div>
            )}
            {/* Resubmit form */}
            <div className="px-5 py-4" style={{ background: "var(--surface)" }}>
              {!showResubmitPanel ? (
                <button
                  onClick={() => setShowResubmitPanel(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md"
                  style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit &amp; Resubmit
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                      What did you fix? <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <textarea
                      value={resubmitNote}
                      onChange={(e) => setResubmitNote(e.target.value)}
                      placeholder="Describe what changes you made to address the rejection..."
                      rows={3}
                      className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                  </div>
                  {/* Optional: update departure date/time */}
                  {data.departureDate !== undefined && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                          Update Departure Date <span className="font-normal">(optional)</span>
                        </label>
                        <input
                          type="date"
                          value={resubmitDate}
                          onChange={(e) => setResubmitDate(e.target.value)}
                          className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                          style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                          Update Departure Time <span className="font-normal">(optional)</span>
                        </label>
                        <input
                          type="time"
                          value={resubmitTime}
                          onChange={(e) => setResubmitTime(e.target.value)}
                          className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                          style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end pt-1">
                    <button onClick={() => { setShowResubmitPanel(false); setResubmitNote(""); setError(""); }}
                      className="px-4 py-2 rounded-xl text-sm font-medium border"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                      Cancel
                    </button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleResubmit} disabled={resubmitLoading}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                      {resubmitLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                      {resubmitLoading ? "Resubmitting..." : "Resubmit for Approval"}
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-2 no-print">
          {/* Back button — top left */}
          <div className="mb-3">
            <button onClick={() => router.back()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold border transition-all hover:shadow-sm"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {canPrint && (
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:shadow-sm"
                style={{ background: "var(--surface)", borderColor: "#10b981", color: "#10b981" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Gate Pass
              </button>
            )}

          </div>{/* end flex gap-3 */}

          {/* ── APPROVER: Service Orders panel — full width, centered ── */}
          {isApproverView && pendingApproval && !approveResult && data?.passType === "AFTER_SALES" && data?.passSubType === "MAIN_OUT" && (() => {
              const paid    = serviceOrders.filter(o => o.isAssigned);
              const unpaid  = serviceOrders.filter(o => !o.isAssigned);
              const total   = serviceOrders.length;
              const paidPct = total > 0 ? Math.round((paid.length / total) * 100) : 0;
              return (
                <div className="w-full rounded-2xl border flex flex-col overflow-hidden mb-2"
                  style={{ borderColor: "#fbbf24", background: "var(--surface)", maxHeight: "480px" }}>

                  {/* Header — always visible */}
                  <div className="px-4 py-3 border-b flex items-center gap-3 flex-shrink-0"
                    style={{ borderColor: "#fde68a", background: "linear-gradient(135deg,#fffbeb,#fef3c7)" }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "#fde68a" }}>
                      <svg className="w-4 h-4" style={{ color: "#92400e" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold" style={{ color: "#92400e" }}>Service Orders</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: "#fef2f2", color: "#dc2626" }}>Partial Payment</span>
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: "#b45309" }}>
                        Outstanding invoices flagged. Approving grants special vehicle release.
                      </p>
                    </div>
                    {serviceOrdersLoading && (
                      <svg className="animate-spin w-4 h-4 flex-shrink-0" style={{ color: "#b45309" }} fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    )}
                  </div>

                  {/* Stats + progress — always visible */}
                  {!serviceOrdersLoading && serviceOrders.length > 0 && (
                    <div className="px-4 py-3 border-b flex-shrink-0"
                      style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                      {/* 3 stat pills */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="flex-1 rounded-xl py-2 text-center border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                          <p className="text-lg font-bold leading-tight" style={{ color: "var(--text)" }}>{total}</p>
                          <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Total</p>
                        </div>
                        <div className="flex-1 rounded-xl py-2 text-center border"
                          style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                          <p className="text-lg font-bold leading-tight" style={{ color: "#15803d" }}>{paid.length}</p>
                          <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#16a34a" }}>Paid</p>
                        </div>
                        <div className="flex-1 rounded-xl py-2 text-center border"
                          style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                          <p className="text-lg font-bold leading-tight" style={{ color: "#dc2626" }}>{unpaid.length}</p>
                          <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#dc2626" }}>Unpaid</p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#fecaca" }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${paidPct}%`, background: "linear-gradient(90deg,#16a34a,#22c55e)" }} />
                        </div>
                        <span className="text-[10px] font-bold flex-shrink-0"
                          style={{ color: paidPct === 100 ? "#15803d" : "#d97706" }}>{paidPct}%</span>
                      </div>
                    </div>
                  )}

                  {/* Scrollable orders table */}
                  {!serviceOrdersLoading && serviceOrders.length > 0 && (
                    <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "thin" }}>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)", width: "32px" }}>#</th>
                            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Order ID</th>
                            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>SAP Status</th>
                            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Payment Terms</th>
                            <th className="px-4 py-2.5 text-center font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Payment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {serviceOrders.map((o, idx) => (
                            <tr key={o.id}
                              style={{
                                background: o.isAssigned
                                  ? (idx % 2 === 0 ? "#f0fdf4" : "#dcfce780")
                                  : (idx % 2 === 0 ? "#fff5f5" : "#fef2f2"),
                                borderBottom: "1px solid var(--border)",
                              }}>
                              <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>{idx + 1}</td>
                              <td className="px-4 py-2.5">
                                <span className="font-bold font-mono" style={{ color: "var(--text)" }}>{o.orderId}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="px-2 py-0.5 rounded-md font-semibold"
                                  style={{
                                    background: o.orderStatus?.toLowerCase().includes("close") || o.orderStatus?.toLowerCase().includes("done")
                                      ? "#f0fdf4" : o.orderStatus?.toLowerCase().includes("reject")
                                      ? "#fef2f2" : "#f1f5f9",
                                    color: o.orderStatus?.toLowerCase().includes("close") || o.orderStatus?.toLowerCase().includes("done")
                                      ? "#15803d" : o.orderStatus?.toLowerCase().includes("reject")
                                      ? "#dc2626" : "#475569",
                                  }}>
                                  {o.orderStatus || "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                                {o.payTerm || "—"}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                                  style={{
                                    background: o.isAssigned ? "#dcfce7" : "#fee2e2",
                                    color: o.isAssigned ? "#15803d" : "#dc2626",
                                  }}>
                                  {o.isAssigned
                                    ? <><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> Paid</>
                                    : <><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Unpaid</>
                                  }
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!serviceOrdersLoading && serviceOrders.length === 0 && (
                    <div className="px-4 py-5 text-center flex-shrink-0">
                      <p className="text-sm font-semibold" style={{ color: "#b45309" }}>No orders recorded</p>
                      <p className="text-xs mt-0.5" style={{ color: "#d97706" }}>Cashier has not linked any service orders yet.</p>
                    </div>
                  )}

                  {/* Approve / Reject — sticky footer inside panel */}
                  <div className="px-4 py-3 border-t flex items-center gap-2 flex-shrink-0"
                    style={{ borderColor: "#fde68a", background: "var(--surface)" }}>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={() => { setShowRejectBox(!showRejectBox); setError(""); }}
                      disabled={rejectLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 transition-all"
                      style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Reject
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleApprove} disabled={approveLoading}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#15803d,#22c55e)" }}>
                      {approveLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      {approveLoading ? "Approving…" : "Approve"}
                    </motion.button>
                  </div>
                </div>
              );
            })()}

          <div className="flex items-center gap-3 flex-wrap mt-2">
            {/* ── APPROVER / ADMIN buttons (non-AFTER_SALES or non-MAIN_OUT) ── */}
            {isApproverView && pendingApproval && !approveResult && !(data?.passType === "AFTER_SALES" && data?.passSubType === "MAIN_OUT") && (
              <>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setShowRejectBox(!showRejectBox); setError(""); }}
                  disabled={rejectLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 transition-all"
                  style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleApprove} disabled={approveLoading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#15803d,#22c55e)" }}>
                  {approveLoading
                    ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  {approveLoading ? "Approving..." : "Approve"}
                </motion.button>
              </>
            )}

            {/* ── INITIATOR / AREA_SALES_OFFICER buttons (own passes only) ── */}
            {isInitiatorView && (
              <>
                {canCancel && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={handleCancel} disabled={cancelLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 transition-all"
                    style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444" }}>
                    {cancelLoading
                      ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                    Cancel Request
                  </motion.button>
                )}
                {!["REJECTED", "CANCELLED", "PENDING_APPROVAL"].includes(data.status) && (
                  canDirectGateIn ? (
                    // INITIATOR viewing a non-own AFTER_SALES SUB_IN/SUB_OUT_IN — vehicle arriving at their location
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleMarkAsIn} disabled={actionLoading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
                      {actionLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      {actionLoading ? "Confirming..." : "Confirm Arrived"}
                    </motion.button>
                  ) : data.status === "APPROVED" && isCreator ? (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleMarkAsOut} disabled={actionLoading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      style={{ background: isMainIn ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                      {actionLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMainIn ? "M5 13l4 4L19 7" : "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"} /></svg>}
                      {actionLoading ? "Marking..." : isMainIn ? "Mark as IN" : "Mark as OUT"}
                    </motion.button>
                  ) : data.status === "GATE_OUT" && data.passType === "AFTER_SALES"
                    && (data.passSubType === "SUB_OUT_IN" || data.passSubType === "MAIN_OUT") ? (
                    // After Sales GATE_OUT — only SUB_OUT_IN (returning to HQ) and MAIN_OUT (customer handover)
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleMarkAsIn} disabled={actionLoading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
                      {actionLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      {actionLoading ? "Confirming..." : (data.passSubType === "MAIN_OUT" ? "Confirm Handover" : "Mark as Arrived")}
                    </motion.button>
                  ) : (
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border"
                      style={{ background: "var(--surface)", borderColor: "#3b82f6", color: "#3b82f6", opacity: 0.7 }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {data.status === "GATE_OUT" ? "Marked as Out" : data.status === "CASHIER_REVIEW" ? "Awaiting Cashier Review" : "Completed"}
                    </div>
                  )
                )}
                {pendingApproval && (
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)", opacity: 0.6 }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Awaiting Approval
                  </div>
                )}
              </>
            )}

            {/* ── RECIPIENT buttons — HQ gate confirmation (MAIN_IN arriving, MAIN_OUT/SUB_OUT departing) ── */}
            {canRecipientGateIn && (
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleMarkAsIn} disabled={actionLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                style={{ background: isMainIn ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                {actionLoading
                  ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMainIn ? "M5 13l4 4L19 7" : "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"} /></svg>}
                {actionLoading ? "Confirming..." : isMainIn ? "Confirm Vehicle IN" : "Confirm Gate OUT"}
              </motion.button>
            )}
          </div>{/* end flex gap-3 remaining buttons */}
        </div>{/* end mt-2 no-print */}

      </motion.div>
    </>
  );
}
