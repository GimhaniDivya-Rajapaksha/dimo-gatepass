"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import DatePicker from "@/components/ui/DatePicker";
import TimePicker from "@/components/ui/TimePicker";
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
  paymentType: string | null;
  hasCredit: boolean;
  hasImmediate: boolean;
  cashierCleared: boolean;
  creditApproved: boolean;
  createdBy: { id: string; name: string; email: string }; approvedBy: { name: string } | null;
  createdAt: string; approvedAt: string | null;
  subPasses?: SubPassSummary[];
  parentPass?: { id: string; gatePassNumber: string; passSubType: string | null; status: string; toLocation: string | null } | null;
};

const statusCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval",     bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  APPROVED:         { label: "Approved",              bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",              bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
  INITIATOR_OUT:    { label: "Initiator Confirmed",   bg: "#fdf4ff", color: "#7e22ce", dot: "#a855f7" },
  GATE_OUT:         { label: "Gate Out",              bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",             bg: "#f5f3ff", color: "#5b21b6", dot: "#8b5cf6" },
  CANCELLED:        { label: "Cancelled",             bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
  CASHIER_REVIEW:   { label: "Cashier Review",        bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
};

/* Real vehicle colour palette */
const colorPalette: Record<string, { hex: string; border: string }> = {
  "White":           { hex: "#f8fafc", border: "#cbd5e1" },
  "Pearl White":     { hex: "#f0f4f8", border: "#94a3b8" },
  "Off White":       { hex: "#fafaf7", border: "#d1d5db" },
  "Black":           { hex: "#111827", border: "#374151" },
  "Midnight Black":  { hex: "#0f172a", border: "#334155" },
  "Jet Black":       { hex: "#1c1c1e", border: "#3f3f46" },
  "Silver":          { hex: "#c0c5ce", border: "#94a3b8" },
  "Metallic Silver": { hex: "#a8b2bc", border: "#64748b" },
  "Grey":            { hex: "#6b7280", border: "#4b5563" },
  "Dark Grey":       { hex: "#374151", border: "#1f2937" },
  "Graphite":        { hex: "#4b5563", border: "#374151" },
  "Blue":            { hex: "#2563eb", border: "#1d4ed8" },
  "Navy Blue":       { hex: "#1e3a8a", border: "#1e3a8a" },
  "Dark Blue":       { hex: "#1e3a8a", border: "#1e40af" },
  "Azure Blue":      { hex: "#0ea5e9", border: "#0284c7" },
  "Cobalt Blue":     { hex: "#2563eb", border: "#1d4ed8" },
  "Sky Blue":        { hex: "#38bdf8", border: "#0284c7" },
  "Red":             { hex: "#dc2626", border: "#b91c1c" },
  "Crimson Red":     { hex: "#be123c", border: "#9f1239" },
  "Dark Red":        { hex: "#991b1b", border: "#7f1d1d" },
  "Maroon":          { hex: "#7f1d1d", border: "#450a0a" },
  "Green":           { hex: "#16a34a", border: "#15803d" },
  "Jungle Green":    { hex: "#14532d", border: "#052e16" },
  "Olive Green":     { hex: "#365314", border: "#1a2e05" },
  "Orange":          { hex: "#ea580c", border: "#c2410c" },
  "Yellow":          { hex: "#ca8a04", border: "#a16207" },
  "Gold":            { hex: "#d97706", border: "#b45309" },
  "Champagne Gold":  { hex: "#d4a04a", border: "#b5832a" },
  "Brown":           { hex: "#78350f", border: "#451a03" },
  "Beige":           { hex: "#d6c5a0", border: "#a08960" },
  "Purple":          { hex: "#7c3aed", border: "#6d28d9" },
  "Twilight Purple": { hex: "#4c1d95", border: "#3b0764" },
};
function getVehicleColor(name: string | null) {
  if (!name) return { hex: "#94a3b8", border: "#64748b" };
  return colorPalette[name]
    ?? Object.entries(colorPalette).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
    ?? { hex: "#94a3b8", border: "#64748b" };
}

/* Car SVG — side view */
function CarIcon({ size = 24, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={Math.round(size * 0.55)} viewBox="0 0 56 30" fill="none">
      <rect x="2" y="14" width="52" height="11" rx="3" fill={color} opacity={0.95} />
      <path d="M13 14 L18 4 L38 4 L43 14Z" fill={color} opacity={0.9} />
      <path d="M19.5 5.5 L16 13h9.5V5.5Z" fill={color} opacity={0.3} />
      <path d="M36.5 5.5 L40 13h-9.5V5.5Z" fill={color} opacity={0.3} />
      <rect x="27" y="5.5" width="9" height="7.5" fill={color} opacity={0.3} />
      <circle cx="15" cy="25.5" r="4.5" fill="rgba(0,0,0,0.5)" />
      <circle cx="15" cy="25.5" r="2"   fill={color} opacity={0.3} />
      <circle cx="41" cy="25.5" r="4.5" fill="rgba(0,0,0,0.5)" />
      <circle cx="41" cy="25.5" r="2"   fill={color} opacity={0.3} />
      <rect x="53" y="16" width="2" height="4" rx="1" fill="#fde68a" opacity={0.9} />
      <rect x="1"  y="16" width="2" height="4" rx="1" fill="#fca5a5" opacity={0.9} />
    </svg>
  );
}

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
  const [securityGateOutLoading, setSecurityGateOutLoading] = useState(false);
  const [securitySlidePos, setSecuritySlidePos] = useState(0);
  const [securityDragging, setSecurityDragging] = useState(false);
  const securityTrackRef = useRef<HTMLDivElement>(null);
  const securityStartXRef = useRef(0);
  const [securityGateInLoading, setSecurityGateInLoading] = useState(false);
  const [securitySlideInPos, setSecuritySlideInPos] = useState(0);
  const [securityInDragging, setSecurityInDragging] = useState(false);
  const securityInTrackRef = useRef<HTMLDivElement>(null);
  const securityInStartXRef = useRef(0);

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

  // Fetch service orders for:
  //   1. Approver reviewing AFTER_SALES MAIN_OUT credit orders
  //   2. CUSTOMER_DELIVERY — display SAP invoice status panel
  useEffect(() => {
    if (!data) return;
    const needsAfterSalesOrders = data.passType === "AFTER_SALES" && data.passSubType === "MAIN_OUT" && data.hasCredit && !data.creditApproved;
    const needsCdOrders = data.passType === "CUSTOMER_DELIVERY";
    if (!needsAfterSalesOrders && !needsCdOrders) return;
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
      const dest = role === "RECIPIENT" ? "/recipient" : role === "AREA_SALES_OFFICER" ? "/aso" : "/initiator";
      setTimeout(() => router.push(dest), 2000);
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
      const dest = role === "AREA_SALES_OFFICER" ? "/aso" : "/initiator";
      setTimeout(() => router.push(dest), 2000);
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

  async function handleCreditApprove() {
    setApproveLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "credit_approve" }),
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

  async function handleSecurityGateOut() {
    setSecurityGateOutLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "security_gate_out" }),
      });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
      setTimeout(() => router.push("/gate-pass/security-gate-out"), 2000);
    } catch {
      setSecurityGateOutLoading(false);
      setError("Could not confirm gate out. Please try again.");
    }
  }

  async function handleSecurityGateIn() {
    setSecurityGateInLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "security_gate_in" }),
      });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
      setTimeout(() => router.push("/gate-pass/security-gate-out"), 2000);
    } catch {
      setSecurityGateInLoading(false);
      setError("Could not confirm gate in. Please try again.");
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
  const isSecurityOfficer = role === "SECURITY_OFFICER";
  // Security Officer can confirm Gate OUT for APPROVED passes, or INITIATOR_OUT (SUB_OUT two-step)
  const canSecurityGateOut = isSecurityOfficer && (data.status === "APPROVED" || data.status === "INITIATOR_OUT");
  const canSecurityGateIn  = isSecurityOfficer && (
    (data.status === "GATE_OUT" && (data.passSubType === "MAIN_IN" || data.passSubType === "SUB_OUT_IN" || data.passType === "CUSTOMER_DELIVERY")) ||
    (data.status === "APPROVED" && data.passType === "AFTER_SALES" && data.passSubType === "SUB_IN")
  );
  const isASO = role === "AREA_SALES_OFFICER";
  const pendingApproval = data.status === "PENDING_APPROVAL";
  // Check if current user created this pass (to determine gate_out eligibility)
  const isCreator = data.createdBy.id === session?.user?.id || data.createdBy.email === session?.user?.email;
  // Security B confirms SUB_IN gate IN — Initiator/ASO do NOT confirm SUB_IN directly
  const canDirectGateIn = false;
  // MAIN_IN (Service/Repair) — vehicle arriving at DIMO, button label differs from outbound passes
  const isMainIn = data.passType === "AFTER_SALES" && data.passSubType === "MAIN_IN";
  const isRecipientView = role === "RECIPIENT";
  // RECIPIENT confirms at HQ gate:
  //   - Non-AFTER_SALES (LOCATION_TRANSFER, CUSTOMER_DELIVERY): any GATE_OUT pass
  //   - AFTER_SALES: only MAIN_IN (arriving), MAIN_OUT, SUB_OUT (departing HQ)
  const isRecipientHQGate = isRecipientView && data.status === "GATE_OUT"
    && (data.passType !== "AFTER_SALES"
        || isMainIn
        || data.passSubType === "MAIN_OUT"
        || data.passSubType === "SUB_OUT");
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
                <div className="w-7 h-7 rounded-full shadow-md relative overflow-hidden"
                  style={{ background: getVehicleColor(data.vehicleColor).hex, border: `2px solid ${getVehicleColor(data.vehicleColor).border}` }}>
                  <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.4) 0%,transparent 60%)" }} />
                </div>
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

        {/* ── Payment Clearance Progress (MAIN_OUT in CASHIER_REVIEW) ── */}
        {data?.passType === "AFTER_SALES" && data?.passSubType === "MAIN_OUT" && data?.status === "CASHIER_REVIEW" && (
          <div className="mb-4 rounded-2xl border overflow-hidden no-print" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="px-5 py-3 border-b" style={{ background: "#f8fafc", borderColor: "var(--border)" }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Payment Clearance Progress</p>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: data.cashierCleared ? "#f0fdf4" : "#fef3c7", border: `1px solid ${data.cashierCleared ? "#bbf7d0" : "#fde68a"}` }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: data.cashierCleared ? "#22c55e" : "#f59e0b" }}>
                  {data.cashierCleared
                    ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  }
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: data.cashierCleared ? "#15803d" : "#92400e" }}>Cashier Review</p>
                  <p className="text-[11px]" style={{ color: data.cashierCleared ? "#16a34a" : "#b45309" }}>{data.cashierCleared ? "Immediate orders cleared ✓" : "Clearing immediate orders…"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: data.creditApproved ? "#f0fdf4" : data.hasCredit ? "#eff6ff" : "#f1f5f9", border: `1px solid ${data.creditApproved ? "#bbf7d0" : data.hasCredit ? "#bfdbfe" : "#e2e8f0"}` }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: data.creditApproved ? "#22c55e" : data.hasCredit ? "#3b82f6" : "#94a3b8" }}>
                  {data.creditApproved
                    ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                  }
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: data.creditApproved ? "#15803d" : data.hasCredit ? "#1d4ed8" : "#64748b" }}>Credit Approval</p>
                  <p className="text-[11px]" style={{ color: data.creditApproved ? "#16a34a" : data.hasCredit ? "#3b82f6" : "#94a3b8" }}>
                    {data.creditApproved ? "Credit orders approved ✓" : data.hasCredit ? "Awaiting approver…" : "No credit orders"}
                  </p>
                </div>
              </div>
            </div>
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
                        <DatePicker value={resubmitDate} onChange={setResubmitDate} min={new Date().toISOString().split("T")[0]} placeholder="Pick new date" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                          Update Departure Time <span className="font-normal">(optional)</span>
                        </label>
                        <TimePicker value={resubmitTime} onChange={setResubmitTime} placeholder="Pick new time" />
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
            {/* Hide the plain print button when the green "Ready to Print" banner already shows it */}
            {canPrint && !(isInitiatorView && data.status === "APPROVED" && data.passType === "AFTER_SALES" && data.passSubType === "MAIN_OUT") && (
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

          {/* ── INITIATOR: Print Ready banner (APPROVED = all checks done) ── */}
          {isInitiatorView && data.status === "APPROVED" && data.passType === "AFTER_SALES" && data.passSubType === "MAIN_OUT" && (
            <div className="w-full rounded-2xl border mb-3 flex items-center gap-4 px-5 py-3.5 overflow-hidden"
              style={{ borderColor: "#10b981", background: "linear-gradient(135deg,#f0fdf4,#dcfce7)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#bbf7d0" }}>
                <svg className="w-5 h-5" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "#15803d" }}>All Checks Complete — Gate Pass Ready to Print</p>
                <p className="text-xs mt-0.5" style={{ color: "#16a34a" }}>
                  Payment cleared & approved. Security Officer will confirm Gate OUT. Print the gate pass now.
                </p>
              </div>
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white flex-shrink-0 shadow-sm"
                style={{ background: "linear-gradient(135deg,#15803d,#22c55e)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Now
              </button>
            </div>
          )}

          {/* ── APPROVER / ALL: Customer Delivery Invoice Status panel ── */}
          {data?.passType === "CUSTOMER_DELIVERY" && serviceOrders.length > 0 && (() => {
            const isInvoiced = data.paymentType === "INVOICED";
            return (
              <div className="w-full rounded-2xl border mb-3 overflow-hidden"
                style={{ borderColor: isInvoiced ? "#86efac" : "#fed7aa", background: "var(--surface)" }}>
                {/* Header */}
                <div className="px-5 py-3.5 flex items-center gap-3"
                  style={{ background: isInvoiced ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : "linear-gradient(135deg,#fff7ed,#fef3c7)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: isInvoiced ? "#bbf7d0" : "#fde68a" }}>
                    <svg className="w-5 h-5" style={{ color: isInvoiced ? "#15803d" : "#b45309" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold" style={{ color: isInvoiced ? "#15803d" : "#b45309" }}>
                        SAP Invoice Status —
                      </p>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                        style={{
                          background: isInvoiced ? "#15803d" : "#ea580c",
                          color: "white",
                        }}>
                        {isInvoiced ? "INVOICED" : "NOT INVOICED"}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: isInvoiced ? "#16a34a" : "#c2410c" }}>
                      {isInvoiced
                        ? "Billing is complete (HSTAT: H070). This vehicle has been invoiced."
                        : "Billing is not yet complete. Vehicle has not been invoiced."}
                    </p>
                  </div>
                </div>
                {/* Orders table — row count badge */}
                <div className="px-5 py-2 flex items-center gap-2" style={{ background: "var(--surface2)", borderTop: `1px solid ${isInvoiced ? "#bbf7d0" : "#fed7aa"}` }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {serviceOrders.length} order{serviceOrders.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>· scroll to view all</span>
                </div>
                {/* Sticky-header scrollable table */}
                <div className="overflow-x-auto" style={{ maxHeight: 260, overflowY: "auto", scrollbarWidth: "thin" }}>
                  <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                      <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                        {["Order ID", "SAP Status", "HSTAT", "Billing Type", "Billing Date"].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)", fontSize: "9px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {serviceOrders.map((o, idx) => {
                        // payTerm stored as "HSTAT:<code>|<billingType>|<billingDate>"
                        const parts = (o.payTerm || "").split("|");
                        const hstat = parts[0]?.replace("HSTAT:", "") || "—";
                        const billingType = parts[1] || "—";
                        const billingDate = parts[2] || "—";
                        const inv = hstat === "H070";
                        return (
                          <tr key={o.id} style={{ background: idx % 2 === 0 ? "var(--surface)" : "var(--surface2)", borderTop: "1px solid var(--border)" }}>
                            <td className="px-4 py-2.5 font-mono font-bold" style={{ color: "var(--text)" }}>{o.orderId}</td>
                            <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{o.orderStatus}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                                style={{ background: inv ? "#dcfce7" : "#fef3c7", color: inv ? "#15803d" : "#b45309" }}>
                                {hstat}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{billingType}</td>
                            <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{billingDate}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ── APPROVER: Credit Approval banner (MAIN_OUT with credit orders pending) ── */}
          {isApproverView && !approveResult && data?.passType === "AFTER_SALES" && data?.passSubType === "MAIN_OUT" && data?.hasCredit && !data?.creditApproved && (() => {
            const immediateTerms = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction"];
            const creditOrders = serviceOrders.filter((o) => {
              const t = (o.payTerm || "").toLowerCase().trim();
              return t !== "" && !immediateTerms.includes(t);
            });
            const immOrders = serviceOrders.filter((o) => immediateTerms.includes((o.payTerm || "").toLowerCase().trim()) || (o.payTerm || "").trim() === "");
            return (
            <div className="w-full rounded-2xl border mb-3 overflow-hidden"
              style={{ borderColor: "#2563eb", background: "var(--surface)" }}>
              <div className="px-5 py-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#bfdbfe" }}>
                  <svg className="w-5 h-5" style={{ color: "#1d4ed8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: "#1e40af" }}>Credit Payment — Parallel Approval Required</p>
                  <p className="text-xs mt-1" style={{ color: "#3b82f6" }}>
                    This vehicle has credit payment orders. Your approval runs in parallel with cashier clearance. Both must complete before Security Officer releases the vehicle.
                  </p>
                </div>
              </div>

              {/* Credit orders table */}
              {serviceOrdersLoading ? (
                <div className="px-5 py-4 flex items-center gap-2" style={{ borderTop: "1px solid #bfdbfe" }}>
                  <svg className="animate-spin w-4 h-4" style={{ color: "#2563eb" }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <p className="text-xs" style={{ color: "#3b82f6" }}>Loading credit orders…</p>
                </div>
              ) : creditOrders.length > 0 ? (
                <div style={{ borderTop: "1px solid #bfdbfe" }}>
                  {/* Stats row */}
                  <div className="px-5 py-3 flex items-center gap-3" style={{ background: "#eff6ff" }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: "#2563eb" }} />
                      <span className="text-xs font-bold" style={{ color: "#1e40af" }}>{creditOrders.length} credit order{creditOrders.length !== 1 ? "s" : ""} requiring approval</span>
                    </div>
                    {immOrders.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#b45309" }}>
                        + {immOrders.length} immediate order{immOrders.length !== 1 ? "s" : ""} handled by Cashier
                      </span>
                    )}
                  </div>
                  {/* Table */}
                  <div className="overflow-x-auto" style={{ maxHeight: "260px", overflowY: "auto", scrollbarWidth: "thin" }}>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr style={{ background: "#dbeafe", borderBottom: "2px solid #bfdbfe" }}>
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-wider" style={{ color: "#1e40af", width: "32px" }}>#</th>
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-wider" style={{ color: "#1e40af" }}>Order ID</th>
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-wider" style={{ color: "#1e40af" }}>SAP Status</th>
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-wider" style={{ color: "#1e40af" }}>Payment Terms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditOrders.map((o, idx) => (
                          <tr key={o.id} style={{ background: idx % 2 === 0 ? "#eff6ff" : "#dbeafe40", borderBottom: "1px solid #bfdbfe" }}>
                            <td className="px-4 py-2.5 font-medium" style={{ color: "#3b82f6" }}>{idx + 1}</td>
                            <td className="px-4 py-2.5">
                              <span className="font-bold font-mono" style={{ color: "#1e40af" }}>{o.orderId}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded-md font-semibold text-[10px]"
                                style={{
                                  background: o.orderStatus?.toLowerCase().includes("close") || o.orderStatus?.toLowerCase().includes("done") ? "#f0fdf4" : "#f1f5f9",
                                  color: o.orderStatus?.toLowerCase().includes("close") || o.orderStatus?.toLowerCase().includes("done") ? "#15803d" : "#475569",
                                }}>
                                {o.orderStatus || "Open"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: "#dbeafe", color: "#1e40af" }}>
                                {o.payTerm || "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : !serviceOrdersLoading && serviceOrders.length === 0 ? null : (
                <div className="px-5 py-3" style={{ borderTop: "1px solid #bfdbfe" }}>
                  <p className="text-xs" style={{ color: "#3b82f6" }}>No credit orders found. Approve to proceed.</p>
                </div>
              )}

              <div className="px-5 py-4 flex items-center gap-3" style={{ borderTop: "1px solid #bfdbfe" }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setShowRejectBox(!showRejectBox); setError(""); }}
                  disabled={rejectLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 transition-all"
                  style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject Credit Request
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleCreditApprove} disabled={approveLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                  {approveLoading
                    ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  {approveLoading ? "Approving…" : "Grant Credit Approval"}
                </motion.button>
              </div>
            </div>
            );
          })()}

          {/* ── APPROVER: Service Orders panel (legacy non-credit path — now handled by credit_approve flow) ── */}
          {false && isApproverView && pendingApproval && !approveResult && data?.passType === "AFTER_SALES" && data?.passSubType === "MAIN_OUT" && data?.paymentType !== "CREDIT" && (() => {
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
                  ) : data.status === "APPROVED" && isCreator && data.passType === "AFTER_SALES" && data.passSubType !== "MAIN_OUT" ? (
                    // MAIN_IN → "Mark as IN", SUB_OUT → "Confirm Gate Out", SUB_IN/SUB_OUT_IN → "Mark as OUT"
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleMarkAsOut} disabled={actionLoading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      style={{ background: isMainIn ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                      {actionLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMainIn ? "M5 13l4 4L19 7" : "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"} /></svg>}
                      {actionLoading ? "Marking..." : isMainIn ? "Mark as IN" : data.passSubType === "SUB_OUT" ? "Confirm Gate Out" : "Mark as OUT"}
                    </motion.button>
                  ) : data.status === "APPROVED" && isCreator && data.passType === "AFTER_SALES" && data.passSubType === "MAIN_OUT" ? (
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border"
                      style={{ background: "var(--surface)", borderColor: "#3b82f6", color: "#3b82f6", opacity: 0.7 }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Awaiting Security Officer
                    </div>
                  ) : data.status === "INITIATOR_OUT" && data.passType === "AFTER_SALES" && data.passSubType === "SUB_OUT" ? (
                    // SUB_OUT two-step: initiator confirmed, waiting for security to confirm Gate OUT
                    <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl border w-full"
                      style={{ background: "linear-gradient(135deg,#fdf4ff,#ede9fe)", borderColor: "#c4b5fd" }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#ddd6fe" }}>
                        <svg className="w-4 h-4" style={{ color: "#6d28d9" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "#6d28d9" }}>Gate Out Confirmed — Awaiting Security Release</p>
                        <p className="text-xs mt-0.5" style={{ color: "#7c3aed" }}>You confirmed vehicle departure. Security Officer will physically confirm Gate OUT at the gate.</p>
                      </div>
                    </div>
                  ) : data.status === "APPROVED" && isCreator && (data.passType === "LOCATION_TRANSFER" || data.passType === "CUSTOMER_DELIVERY") ? (
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border"
                      style={{ background: "var(--surface)", borderColor: "#3b82f6", color: "#3b82f6", opacity: 0.7 }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Awaiting Security Officer
                    </div>
                  ) : data.status === "GATE_OUT" && data.passType === "AFTER_SALES" && data.passSubType === "MAIN_OUT" ? (
                    // MAIN_OUT at GATE_OUT — Initiator/ASO confirms customer handover
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleMarkAsIn} disabled={actionLoading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
                      {actionLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      {actionLoading ? "Confirming..." : "Confirm Handover"}
                    </motion.button>
                  ) : isASO && data.status === "GATE_OUT" && data.passType === "AFTER_SALES" && data.passSubType === "SUB_OUT" ? (
                    // SUB_OUT at GATE_OUT — ASO confirms vehicle arrived at their sub-location
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={handleMarkAsIn} disabled={actionLoading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
                      {actionLoading
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      {actionLoading ? "Confirming..." : "Confirm Sub IN (Vehicle Arrived)"}
                    </motion.button>
                  ) : !isASO && data.status === "GATE_OUT" && data.passType === "AFTER_SALES" && data.passSubType === "SUB_OUT" ? (
                    // SUB_OUT at GATE_OUT — Initiator sees informational banner
                    <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl border w-full"
                      style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", borderColor: "#93c5fd" }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#bfdbfe" }}>
                        <svg className="w-4 h-4" style={{ color: "#1d4ed8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "#1d4ed8" }}>Vehicle Out — Awaiting Gate IN at Sub-Location</p>
                        <p className="text-xs mt-0.5" style={{ color: "#3b82f6" }}>Security confirmed Gate OUT. ASO will create a Sub IN pass — Security Officer at the sub-location will then confirm arrival.</p>
                      </div>
                    </div>
                  ) : data.status === "GATE_OUT" && data.passType === "AFTER_SALES" && data.passSubType === "SUB_OUT_IN" ? (
                    // SUB_OUT_IN at GATE_OUT — vehicle returning to DIMO, awaiting Security Gate IN
                    <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl border w-full"
                      style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderColor: "#86efac" }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#bbf7d0" }}>
                        <svg className="w-4 h-4" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "#15803d" }}>Vehicle En Route Back — Awaiting Security Gate IN</p>
                        <p className="text-xs mt-0.5" style={{ color: "#16a34a" }}>Security Officer will confirm vehicle arrival at DIMO gate.</p>
                      </div>
                    </div>
                  ) : data.status === "GATE_OUT" && data.passType === "AFTER_SALES" && data.passSubType === "MAIN_IN" ? (
                    // MAIN_IN at GATE_OUT = vehicle is en route, waiting for Security Officer to confirm Gate IN
                    <div className="flex flex-col gap-2 w-full">
                      <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl border"
                        style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderColor: "#86efac" }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#bbf7d0" }}>
                          <svg className="w-4 h-4" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold" style={{ color: "#15803d" }}>Vehicle En Route — Awaiting Security Gate IN</p>
                          <p className="text-xs mt-0.5" style={{ color: "#16a34a" }}>Security Officer will confirm arrival at the gate with a slide.</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border"
                      style={{ background: "var(--surface)", borderColor: "#3b82f6", color: "#3b82f6", opacity: 0.7 }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {data.status === "CASHIER_REVIEW" ? "Awaiting Cashier Review" : "Completed"}
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

            {/* ── RECIPIENT buttons — HQ gate confirmation (arriving → green, departing → blue) ── */}
            {canRecipientGateIn && (() => {
              // arriving: non-AFTER_SALES (LT/CD) OR AFTER_SALES MAIN_IN
              const isArriving = data.passType !== "AFTER_SALES" || isMainIn;
              return (
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleMarkAsIn} disabled={actionLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                style={{ background: isArriving ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                {actionLoading
                  ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isArriving ? "M5 13l4 4L19 7" : "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"} /></svg>}
                {actionLoading ? "Confirming..." : isArriving ? "Confirm Gate IN" : "Confirm Gate OUT"}
              </motion.button>
              );
            })()}

          </div>{/* end flex gap-3 remaining buttons */}
        </div>{/* end mt-2 no-print */}

        {/* ── SECURITY_OFFICER: Gate OUT slide button ── */}
        {canSecurityGateOut && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="mt-4 flex flex-col items-center gap-2 no-print">
            {securityGateOutLoading ? (
              <div className="relative rounded-2xl overflow-hidden w-full max-w-[420px]"
                style={{ height: 60, background: "linear-gradient(135deg,#1a3a8f,#2563eb)" }}>
                <div className="absolute bottom-3.5 left-4 right-4 flex gap-1.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex-1 h-px rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
                  ))}
                </div>
                <motion.div className="absolute bottom-2.5"
                  animate={{ x: ["-40px", "460px"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeIn" }}>
                  <CarIcon size={28} color="white" />
                </motion.div>
                <div className="absolute inset-0 flex items-start justify-center pt-2">
                  <span className="text-xs font-bold text-white/90 tracking-widest uppercase">Releasing Vehicle…</span>
                </div>
              </div>
            ) : (
              <div ref={securityTrackRef}
                className="relative rounded-2xl select-none overflow-hidden w-full max-w-[420px]"
                style={{ height: 60, background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)" }}
                onMouseMove={(e) => {
                  if (!securityDragging) return;
                  const max = (securityTrackRef.current?.offsetWidth ?? 420) - 60;
                  const p = Math.max(0, Math.min(max, e.clientX - securityStartXRef.current));
                  setSecuritySlidePos(p);
                  if (p >= max - 4) { setSecurityDragging(false); setSecuritySlidePos(0); void handleSecurityGateOut(); }
                }}
                onMouseUp={() => { if (securityDragging) { setSecurityDragging(false); setSecuritySlidePos(0); } }}
                onMouseLeave={() => { if (securityDragging) { setSecurityDragging(false); setSecuritySlidePos(0); } }}
                onTouchMove={(e) => {
                  if (!securityDragging) return;
                  const max = (securityTrackRef.current?.offsetWidth ?? 420) - 60;
                  const p = Math.max(0, Math.min(max, e.touches[0].clientX - securityStartXRef.current));
                  setSecuritySlidePos(p);
                  if (p >= max - 4) { setSecurityDragging(false); setSecuritySlidePos(0); void handleSecurityGateOut(); }
                }}
                onTouchEnd={() => { if (securityDragging) { setSecurityDragging(false); setSecuritySlidePos(0); } }}
              >
                <div className="absolute bottom-3.5 left-16 right-4 flex gap-1.5 pointer-events-none">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex-1 h-px rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
                  ))}
                </div>
                <div className="absolute inset-y-0 left-0 rounded-2xl pointer-events-none"
                  style={{ width: securitySlidePos + 60, background: "linear-gradient(90deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05))", transition: securityDragging ? "none" : "width 0.12s" }} />
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
                  <span className="text-xs font-bold tracking-widest uppercase text-white/80">Slide to Gate OUT</span>
                  <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="absolute top-1.5 bottom-1.5 rounded-xl flex items-center justify-center shadow-2xl cursor-grab active:cursor-grabbing"
                  style={{ left: securitySlidePos + 5, width: 52, background: "linear-gradient(135deg,rgba(255,255,255,0.35),rgba(255,255,255,0.15))", border: "1.5px solid rgba(255,255,255,0.4)", backdropFilter: "blur(6px)", transition: securityDragging ? "none" : "left 0.12s" }}
                  onMouseDown={(e) => { setSecurityDragging(true); securityStartXRef.current = e.clientX - securitySlidePos; }}
                  onTouchStart={(e) => { setSecurityDragging(true); securityStartXRef.current = e.touches[0].clientX - securitySlidePos; }}
                >
                  <CarIcon size={28} color="white" />
                </div>
              </div>
            )}
            <p className="text-[10px] font-medium" style={{ color: "#94a3b8" }}>Drag the car → right to release vehicle</p>
          </motion.div>
        )}

        {/* ── SECURITY_OFFICER: Gate IN slide button ── */}
        {canSecurityGateIn && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="mt-4 flex flex-col items-center gap-2 no-print">
            {securityGateInLoading ? (
              <div className="relative rounded-2xl overflow-hidden w-full max-w-[420px]"
                style={{ height: 60, background: "linear-gradient(135deg,#064e3b,#059669)" }}>
                <div className="absolute bottom-3.5 left-4 right-4 flex gap-1.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex-1 h-px rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
                  ))}
                </div>
                <motion.div className="absolute bottom-2.5"
                  animate={{ x: ["460px", "-40px"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  style={{ transform: "scaleX(-1)" }}>
                  <CarIcon size={28} color="white" />
                </motion.div>
                <div className="absolute inset-0 flex items-start justify-center pt-2">
                  <span className="text-xs font-bold text-white/90 tracking-widest uppercase">Confirming Arrival…</span>
                </div>
              </div>
            ) : (
              <div ref={securityInTrackRef}
                className="relative rounded-2xl select-none overflow-hidden w-full max-w-[420px]"
                style={{ height: 60, background: "linear-gradient(135deg,#065f46,#059669)" }}
                onMouseMove={(e) => {
                  if (!securityInDragging) return;
                  const max = (securityInTrackRef.current?.offsetWidth ?? 420) - 60;
                  const p = Math.max(0, Math.min(max, securityInStartXRef.current - e.clientX));
                  setSecuritySlideInPos(p);
                  if (p >= max - 4) { setSecurityInDragging(false); setSecuritySlideInPos(0); void handleSecurityGateIn(); }
                }}
                onMouseUp={() => { if (securityInDragging) { setSecurityInDragging(false); setSecuritySlideInPos(0); } }}
                onMouseLeave={() => { if (securityInDragging) { setSecurityInDragging(false); setSecuritySlideInPos(0); } }}
                onTouchMove={(e) => {
                  if (!securityInDragging) return;
                  const max = (securityInTrackRef.current?.offsetWidth ?? 420) - 60;
                  const p = Math.max(0, Math.min(max, securityInStartXRef.current - e.touches[0].clientX));
                  setSecuritySlideInPos(p);
                  if (p >= max - 4) { setSecurityInDragging(false); setSecuritySlideInPos(0); void handleSecurityGateIn(); }
                }}
                onTouchEnd={() => { if (securityInDragging) { setSecurityInDragging(false); setSecuritySlideInPos(0); } }}
              >
                <div className="absolute bottom-3.5 left-4 right-16 flex gap-1.5 pointer-events-none">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex-1 h-px rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
                  ))}
                </div>
                <div className="absolute inset-y-0 right-0 rounded-2xl pointer-events-none"
                  style={{ width: securitySlideInPos + 60, background: "linear-gradient(270deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05))", transition: securityInDragging ? "none" : "width 0.12s" }} />
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
                  <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                  </svg>
                  <span className="text-xs font-bold tracking-widest uppercase text-white/80">Slide to Gate IN</span>
                </div>
                <div className="absolute top-1.5 bottom-1.5 rounded-xl flex items-center justify-center shadow-2xl cursor-grab active:cursor-grabbing"
                  style={{ right: securitySlideInPos + 5, width: 52, background: "linear-gradient(135deg,rgba(255,255,255,0.35),rgba(255,255,255,0.15))", border: "1.5px solid rgba(255,255,255,0.4)", backdropFilter: "blur(6px)", transition: securityInDragging ? "none" : "right 0.12s" }}
                  onMouseDown={(e) => { setSecurityInDragging(true); securityInStartXRef.current = e.clientX + securitySlideInPos; }}
                  onTouchStart={(e) => { setSecurityInDragging(true); securityInStartXRef.current = e.touches[0].clientX + securitySlideInPos; }}
                >
                  <div style={{ transform: "scaleX(-1)" }}><CarIcon size={28} color="white" /></div>
                </div>
              </div>
            )}
            <p className="text-[10px] font-medium" style={{ color: "#94a3b8" }}>Drag the car ← left to confirm vehicle arrival</p>
          </motion.div>
        )}

      </motion.div>
    </>
  );
}
