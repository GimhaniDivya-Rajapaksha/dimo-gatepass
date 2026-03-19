"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";

type SubPass = {
  id: string; gatePassNumber: string; passSubType: string | null;
  status: string; toLocation: string | null; fromLocation: string | null;
  createdAt: string; departureDate: string | null;
};
type GatePass = {
  id: string; gatePassNumber: string; passType: string; passSubType: string | null;
  status: string; vehicle: string; chassis: string | null;
  departureDate: string | null; requestedBy: string | null;
  toLocation: string | null; fromLocation: string | null; vehicleDetails: string | null;
  createdBy: { name: string }; createdAt: string;
  subPasses?: SubPass[];
};

const statusCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",          bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",           bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",          bg: "#f5f3ff", color: "#5b21b6", dot: "#a855f7" },
  CANCELLED:        { label: "Cancelled",          bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
  CASHIER_REVIEW:   { label: "Cashier Review",      bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
};

const subTypeCfg: Record<string, { label: string; short: string; color: string; dot: string; bg: string }> = {
  MAIN_IN:  { label: "Main Gate IN",  short: "MAIN IN",  color: "#15803d", dot: "#22c55e", bg: "#f0fdf4" },
  SUB_OUT:  { label: "Sub Gate OUT",  short: "SUB OUT",  color: "#1d4ed8", dot: "#3b82f6", bg: "#eff6ff" },
  SUB_IN:   { label: "Sub Gate IN",   short: "SUB IN",   color: "#92400e", dot: "#f59e0b", bg: "#fffbeb" },
  MAIN_OUT: { label: "Main Gate OUT", short: "MAIN OUT", color: "#6b21a8", dot: "#a855f7", bg: "#fdf4ff" },
};

function getCurrentLocation(p: GatePass): { label: string; inTransit: boolean; completed: boolean } {
  const subs = p.subPasses ?? [];
  if (subs.length === 0) return { label: p.toLocation || "Service Center", inTransit: false, completed: false };
  const sorted = [...subs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastActive = sorted.find(sp => !["COMPLETED", "CANCELLED"].includes(sp.status));
  if (lastActive?.passSubType === "SUB_OUT") return { label: `In Transit → ${lastActive.toLocation || "?"}`, inTransit: true, completed: false };
  if (lastActive?.passSubType === "SUB_IN")  return { label: lastActive.toLocation || p.toLocation || "?", inTransit: false, completed: false };
  // All subs completed
  const last = sorted[0];
  if (last?.passSubType === "MAIN_OUT" && ["COMPLETED", "GATE_OUT", "APPROVED"].includes(last.status))
    return { label: "Journey Complete", inTransit: false, completed: true };
  return { label: last?.toLocation || p.toLocation || "?", inTransit: false, completed: false };
}

export default function GatePassListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "ALL");
  const [passTypeFilter, setPassTypeFilter] = useState<"ALL" | "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "AFTER_SALES">("ALL");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [gatingOutId, setGatingOutId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: session } = useSession();
  const isInitiator = session?.user?.role === "INITIATOR";
  const isASO = session?.user?.role === "AREA_SALES_OFFICER";
  const [gatingInId, setGatingInId] = useState<string | null>(null);

  // Styled confirm modal (replaces browser confirm())
  type ConfirmModal = {
    id: string;
    action: "gate_out" | "gate_in" | "cancel";
    icon: "out" | "in" | "cancel";
    title: string;
    message: string;
    confirmLabel: string;
    confirmColor: string;
  };
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "15" });
    if (search) params.set("search", search);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (passTypeFilter !== "ALL") params.set("passType", passTypeFilter);
    if (passTypeFilter === "AFTER_SALES") params.set("parentOnly", "true");
    try {
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const d = await res.json();
        setPasses(d.passes || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      }
    } finally { setLoading(false); }
  }, [page, search, statusFilter, passTypeFilter]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);
  useEffect(() => { setPage(1); }, [search, statusFilter, passTypeFilter]);
  useEffect(() => { setStatusFilter(searchParams.get("status") ?? "ALL"); setPage(1); }, [searchParams]);

  function askGateOut(p: GatePass) {
    const isAfterSales = p.passType === "AFTER_SALES";
    const label = p.passType !== "AFTER_SALES" ? "Gate Out"
      : p.passSubType === "MAIN_IN" ? "Mark IN (Send to Security)"
      : p.passSubType === "SUB_OUT" ? "Gate Out (Send to Security)"
      : "Gate Out";
    setConfirmModal({
      id: p.id, action: "gate_out", icon: "out",
      title: isAfterSales ? "Confirm Gate Action" : "Confirm Gate Out",
      message: isAfterSales
        ? `Vehicle ${p.vehicle} will be marked for ${label}. This will notify the Security Officer at ${p.fromLocation || "the departure location"} to confirm.`
        : `Gate pass ${p.gatePassNumber} will be marked as Gate Out. This will notify the recipient.`,
      confirmLabel: label,
      confirmColor: "#1d4ed8",
    });
  }

  function askGateIn(p: GatePass, label: string) {
    const isAfterSales = p.passType === "AFTER_SALES";
    setConfirmModal({
      id: p.id, action: "gate_in", icon: "in",
      title: "Confirm Vehicle Arrived",
      message: isAfterSales
        ? `Confirm that vehicle ${p.vehicle} has arrived. This will notify the Security Officer at ${p.toLocation || "the arrival location"} to confirm gate entry.`
        : `Mark vehicle ${p.vehicle} as received / arrived?`,
      confirmLabel: label,
      confirmColor: "#15803d",
    });
  }

  function askCancel(id: string) {
    setConfirmModal({
      id, action: "cancel", icon: "cancel",
      title: "Cancel Gate Pass",
      message: "This gate pass request will be cancelled. This action cannot be undone.",
      confirmLabel: "Cancel Gate Pass",
      confirmColor: "#dc2626",
    });
  }

  async function executeConfirm() {
    if (!confirmModal) return;
    const { id, action } = confirmModal;
    setConfirmModal(null);
    if (action === "gate_out") {
      setGatingOutId(id);
      try {
        await fetch(`/api/gate-pass/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "gate_out" }) });
        fetchPasses();
      } finally { setGatingOutId(null); }
    } else if (action === "gate_in") {
      setGatingInId(id);
      try {
        await fetch(`/api/gate-pass/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "gate_in" }) });
        fetchPasses();
      } finally { setGatingInId(null); }
    } else if (action === "cancel") {
      setCancellingId(id);
      try {
        await fetch(`/api/gate-pass/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
        fetchPasses();
      } finally { setCancellingId(null); }
    }
  }

  const isSrTab = passTypeFilter === "AFTER_SALES";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>My Gate Passes</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{total} records found</p>
        </div>
        <Link href="/gate-pass/create" className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md"
          style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Create Gate Pass
        </Link>
      </div>

      {/* Pass Type Tabs */}
      <div className="flex gap-2 mb-4">
        {([
          { key: "ALL", label: "All" },
          { key: "LOCATION_TRANSFER", label: "Location Transfer" },
          { key: "CUSTOMER_DELIVERY", label: "Customer Delivery" },
          { key: "AFTER_SALES", label: "Service / Repair" },
        ] as { key: "ALL" | "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "AFTER_SALES"; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setPassTypeFilter(key)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={passTypeFilter === key
              ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff" }
              : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        {/* Search + filter bar */}
        <div className="flex items-center gap-3 p-4 border-b flex-wrap" style={{ borderColor: "var(--border)" }}>
          <div className="relative flex-1 min-w-52">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by chassis, GP number..."
              className="w-full border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="ALL">All Status</option>
            {Object.entries(statusCfg).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {isSrTab ? (
          /* ── Service/Repair: Journey Cards ── */
          <div className="p-4">
            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border p-5 animate-pulse" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-xl" style={{ background: "var(--border)" }} />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-4 rounded w-40" style={{ background: "var(--border)" }} />
                        <div className="h-3 rounded w-56" style={{ background: "var(--border)" }} />
                        <div className="h-3 rounded w-48" style={{ background: "var(--border)" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : passes.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--surface2)" }}>
                  <svg className="w-7 h-7" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No Service / Repair gate passes found</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {passes.map((p, i) => {
                  const sc = statusCfg[p.status] || statusCfg["PENDING_APPROVAL"];
                  const loc = getCurrentLocation(p);
                  const subs = p.subPasses ?? [];
                  const isExpanded = expandedId === p.id;
                  const canPrint  = ["APPROVED", "GATE_OUT", "COMPLETED"].includes(p.status);
                  const canCancel = p.status === "PENDING_APPROVAL";
                  const totalSteps = subs.length + 1; // include main
                  const completedSteps = [p, ...subs].filter(s => ["COMPLETED", "GATE_OUT", "APPROVED"].includes(s.status)).length;

                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="rounded-2xl border transition-all" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>

                      {/* Card header */}
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          {/* Vehicle icon */}
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface2)" }}>
                            <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 6H5l-2 6v6h2m8-12l2 6h4l-2-6m-4 0V4m0 8H5m8 0v4" />
                            </svg>
                          </div>

                          {/* Main info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-bold text-base" style={{ color: "var(--text)" }}>{p.vehicle}</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />{sc.label}
                              </span>
                            </div>
                            {p.chassis && <p className="text-xs font-mono mb-2" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}

                            {/* Current Location */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold ${loc.inTransit ? "animate-pulse" : ""}`}
                                style={{ background: loc.completed ? "#f5f3ff" : loc.inTransit ? "#eff6ff" : "#f0fdf4", color: loc.completed ? "#5b21b6" : loc.inTransit ? "#1d4ed8" : "#15803d" }}>
                                {loc.inTransit ? (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                ) : loc.completed ? (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                )}
                                {loc.label}
                              </div>
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                {completedSteps}/{totalSteps} steps done
                              </span>
                            </div>
                          </div>

                          {/* Right: GP number + actions */}
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Journey ID</p>
                              <p className="font-mono font-bold text-sm" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => router.push(`/gate-pass/${p.id}`)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center border" title="View"
                                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--accent)" }}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                              <button onClick={() => canPrint && router.push(`/gate-pass/${p.id}?print=1`)} disabled={!canPrint}
                                className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                                style={{ background: canPrint ? "var(--surface)" : "var(--surface2)", borderColor: canPrint ? "#10b981" : "var(--border)", color: canPrint ? "#10b981" : "var(--text-muted)", opacity: canPrint ? 1 : 0.4, cursor: canPrint ? "pointer" : "not-allowed" }}
                                title={canPrint ? "Print" : "Available after approval"}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                              </button>
                              {canCancel && (
                                <button onClick={() => handleCancel(p.id)} disabled={cancellingId === p.id}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                                  style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444", opacity: cancellingId === p.id ? 0.5 : 1 }}
                                  title="Cancel">
                                  {cancellingId === p.id
                                    ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Journey timeline strip */}
                        <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                          <div className="flex items-start gap-0">
                            {/* MAIN_IN node */}
                            {[
                              { passSubType: "MAIN_IN", gatePassNumber: p.gatePassNumber, status: p.status, toLocation: p.toLocation, fromLocation: p.fromLocation, departureDate: p.departureDate, isMain: true },
                              ...subs.map(s => ({ ...s, isMain: false })),
                            ].map((step, idx, arr) => {
                              const stc = subTypeCfg[step.passSubType ?? ""] ?? subTypeCfg["MAIN_IN"];
                              const sSc = statusCfg[step.status] ?? statusCfg["PENDING_APPROVAL"];
                              const isDone = ["COMPLETED", "GATE_OUT", "APPROVED"].includes(step.status);
                              const isCurrent = !isDone;
                              return (
                                <div key={step.gatePassNumber} className="flex items-start flex-1 min-w-0">
                                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                    {/* Node */}
                                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all`}
                                      style={{ borderColor: isDone ? stc.dot : "var(--border)", background: isDone ? stc.dot : "var(--surface2)" }}>
                                      {isDone
                                        ? <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        : <div className="w-2 h-2 rounded-full" style={{ background: "var(--border)" }} />
                                      }
                                    </div>
                                    {/* Step label */}
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-[9px] font-bold leading-none text-center whitespace-nowrap" style={{ color: isDone ? stc.color : "var(--text-muted)" }}>
                                        {stc.short}
                                      </span>
                                      <span className="text-[9px] font-mono leading-none text-center" style={{ color: "var(--text-muted)" }}>
                                        {step.gatePassNumber}
                                      </span>
                                      <span className="inline-flex px-1 py-0 rounded text-[8px] font-semibold leading-4"
                                        style={{ background: sSc.bg, color: sSc.color }}>{sSc.label}</span>
                                    </div>
                                  </div>
                                  {/* Connector line */}
                                  {idx < arr.length - 1 && (
                                    <div className="h-0.5 flex-1 mt-3 mx-1" style={{ background: isDone ? stc.dot + "55" : "var(--border)" }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Expand toggle */}
                          {subs.length > 0 && (
                            <button onClick={() => setExpandedId(isExpanded ? null : p.id)}
                              className="mt-3 flex items-center gap-1.5 text-xs font-medium transition-all"
                              style={{ color: "var(--accent)" }}>
                              <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              {isExpanded ? "Hide journey details" : `Show journey details (${subs.length} move${subs.length > 1 ? "s" : ""})`}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded journey detail */}
                      <AnimatePresence>
                        {isExpanded && subs.length > 0 && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t" style={{ borderColor: "var(--border)" }}>
                            <div className="px-5 py-4 space-y-2" style={{ background: "var(--surface2)" }}>
                              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Vehicle Movement History</p>
                              {/* MAIN_IN entry */}
                              <JourneyStep
                                subType="MAIN_IN" gpNo={p.gatePassNumber} status={p.status}
                                from={p.fromLocation} to={p.toLocation} date={p.departureDate} label="Arrived at service center"
                              />
                              {/* Sub-pass entries */}
                              {subs.map((s) => (
                                <JourneyStep key={s.id}
                                  subType={s.passSubType ?? ""} gpNo={s.gatePassNumber} status={s.status}
                                  from={s.fromLocation} to={s.toLocation} date={s.departureDate}
                                  label={
                                    s.passSubType === "SUB_OUT"  ? "Vehicle sent to sub-plant" :
                                    s.passSubType === "SUB_IN"   ? "Vehicle returned from sub-plant" :
                                    s.passSubType === "MAIN_OUT" ? "Final departure from service center" : ""
                                  }
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── All / LT / CD: Table view ── */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  {["Action", "Gate Pass No", "Vehicle / Chassis", "Departure From", "Requested By", "Departure Date", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: "var(--border)", width: "80%" }} /></td>
                      ))}
                    </tr>
                  ))
                ) : passes.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "var(--surface2)" }}>📋</div>
                      <p className="text-sm">No gate passes found</p>
                    </div>
                  </td></tr>
                ) : (
                  passes.map((p, i) => {
                    const sc = statusCfg[p.status] || statusCfg["PENDING_APPROVAL"];
                    const canPrint   = ["APPROVED", "GATE_OUT", "COMPLETED"].includes(p.status);
                    const canCancel  = p.status === "PENDING_APPROVAL";
                    // For non-AFTER_SALES: standard gate_out when APPROVED
                    // For AFTER_SALES: INITIATOR can gate_out their own MAIN_IN and SUB_OUT; ASO can gate_out SUB_OUT_IN
                    const canGateOut = p.status === "APPROVED" && (
                      p.passType !== "AFTER_SALES"
                        ? true
                        : (isInitiator && ["MAIN_IN", "SUB_OUT"].includes(p.passSubType ?? ""))
                          || (isASO && p.passSubType === "SUB_OUT_IN")
                    );

                    // For AFTER_SALES GATE_OUT: INITIATOR/ASO can confirm arrived (gate_in → COMPLETED)
                    const canGateIn = p.passType === "AFTER_SALES" && p.status === "GATE_OUT"
                      && (isInitiator || isASO);

                    const gateOutLabel = p.passType !== "AFTER_SALES" ? "Gate Out"
                      : p.passSubType === "MAIN_IN" ? "Mark IN"
                      : p.passSubType === "SUB_OUT" ? "Gate Out"
                      : "Gate Out";

                    const gateInLabel = p.passSubType === "MAIN_IN" ? "Confirm IN"
                      : p.passSubType === "SUB_IN" ? "Mark Arrived"
                      : p.passSubType === "SUB_OUT_IN" ? "Mark Arrived"
                      : p.passSubType === "MAIN_OUT" ? "Mark Delivered"
                      : "Confirm";

                    return (
                      <motion.tr key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        className="transition-colors" style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => router.push(`/gate-pass/${p.id}`)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center border"
                              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--accent)" }} title="View">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button onClick={() => canPrint && router.push(`/gate-pass/${p.id}?print=1`)} disabled={!canPrint}
                              className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                              style={{ background: canPrint ? "var(--surface)" : "var(--surface2)", borderColor: canPrint ? "#10b981" : "var(--border)", color: canPrint ? "#10b981" : "var(--text-muted)", opacity: canPrint ? 1 : 0.4, cursor: canPrint ? "pointer" : "not-allowed" }}
                              title={canPrint ? "Print" : "Available after approval"}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                            {canGateOut && (
                              <button onClick={() => askGateOut(p)} disabled={gatingOutId === p.id}
                                className="flex items-center gap-1 px-2.5 h-8 rounded-lg border text-xs font-semibold transition-all"
                                style={{ background: "#eff6ff", borderColor: "#3b82f6", color: "#1d4ed8", opacity: gatingOutId === p.id ? 0.5 : 1 }}
                                title="Mark Gate Out — notify recipient">
                                {gatingOutId === p.id
                                  ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}
                                {gateOutLabel}
                              </button>
                            )}
                            {canGateIn && (
                              <button onClick={() => askGateIn(p, gateInLabel)} disabled={gatingInId === p.id}
                                className="flex items-center gap-1 px-2.5 h-8 rounded-lg border text-xs font-semibold transition-all"
                                style={{ background: "#f0fdf4", borderColor: "#22c55e", color: "#15803d", opacity: gatingInId === p.id ? 0.5 : 1 }}
                                title={`${gateInLabel} — mark vehicle as received`}>
                                {gatingInId === p.id
                                  ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                {gateInLabel}
                              </button>
                            )}
                            {canCancel && (
                              <button onClick={() => askCancel(p.id)} disabled={cancellingId === p.id}
                                className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                                style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444", opacity: cancellingId === p.id ? 0.5 : 1 }}
                                title="Cancel">
                                {cancellingId === p.id
                                  ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                  : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-xs" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                          {p.chassis && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.toLocation || p.vehicleDetails || "-"}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.requestedBy || p.createdBy.name}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{p.departureDate || "-"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />{sc.label}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Showing {passes.length} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>Prev</button>
              <span className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{page}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Styled Confirm Modal */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
            onClick={() => setConfirmModal(null)}>
            <motion.div initial={{ scale: 0.93, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.93, opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              onClick={(e) => e.stopPropagation()}>

              {/* Icon */}
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: confirmModal.icon === "cancel" ? "#fef2f2" : confirmModal.icon === "in" ? "#f0fdf4" : "#eff6ff" }}>
                  {confirmModal.icon === "cancel" ? (
                    <svg className="w-5 h-5" style={{ color: "#dc2626" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : confirmModal.icon === "in" ? (
                    <svg className="w-5 h-5" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" style={{ color: "#1d4ed8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-bold text-base" style={{ color: "var(--text)" }}>{confirmModal.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Action required</p>
                </div>
              </div>

              {/* Message */}
              <p className="text-sm leading-relaxed rounded-xl px-4 py-3" style={{ color: "var(--text)", background: "var(--surface2)" }}>
                {confirmModal.message}
              </p>

              {/* Buttons */}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  Back
                </button>
                <button onClick={executeConfirm}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all shadow-md"
                  style={{ background: confirmModal.confirmColor }}>
                  {confirmModal.confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function JourneyStep({ subType, gpNo, status, from, to, date, label }: {
  subType: string; gpNo: string; status: string; from: string | null; to: string | null; date: string | null; label: string;
}) {
  const stc = subTypeCfg[subType] ?? subTypeCfg["MAIN_IN"];
  const sc  = statusCfg[status]  ?? statusCfg["PENDING_APPROVAL"];
  const isDone = ["COMPLETED", "GATE_OUT", "APPROVED"].includes(status);
  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-xl" style={{ background: "var(--surface)" }}>
      {/* Type dot */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: isDone ? stc.dot : "var(--border)" }}>
        {isDone
          ? <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          : <div className="w-2 h-2 rounded-full" style={{ background: "var(--text-muted)" }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: stc.bg, color: stc.color }}>{stc.label}</span>
          <span className="font-mono text-xs font-semibold" style={{ color: "var(--accent)" }}>{gpNo}</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
        </div>
        <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
        {(from || to) && (
          <div className="flex items-center gap-1.5 text-xs">
            {from && <span className="px-2 py-0.5 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text)" }}>{from}</span>}
            {from && to && <svg className="w-3 h-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}
            {to && <span className="px-2 py-0.5 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text)" }}>{to}</span>}
          </div>
        )}
        {date && <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{date}</p>}
      </div>
    </div>
  );
}
