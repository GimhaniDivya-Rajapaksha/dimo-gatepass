"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────────────────────
type OrderItem = {
  id: string; orderId: string; orderStatus: string;
  payTerm: string; isAssigned: boolean; hstat: string;
};

type VehicleRow = {
  id: string; gatePassNumber: string; vehicle: string;
  chassis: string | null; make: string | null; status: string;
  hasCredit: boolean; hasImmediate: boolean;
  cashierCleared: boolean; creditApproved: boolean; hasOrders: boolean;
  creditOrders: OrderItem[]; immediateOrders: OrderItem[];
  creditCount: number; immediateCount: number; totalOrders: number;
  createdBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  createdAt: string; approvedAt: string | null; serviceJobNo: string | null;
  departureDate: string | null; departureTime: string | null;
  fromLocation: string | null; toLocation: string | null;
};

// ── Status config ──────────────────────────────────────────────────────────────
const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_APPROVAL: { label: "Pending",       bg: "#fff7ed", color: "#c2410c" },
  CASHIER_REVIEW:   { label: "Cashier Review", bg: "#fef3c7", color: "#b45309" },
  APPROVED:         { label: "Approved",       bg: "#f0fdf4", color: "#15803d" },
  GATE_OUT:         { label: "Gate Out",       bg: "#eff6ff", color: "#1d4ed8" },
  COMPLETED:        { label: "Completed",      bg: "#f5f3ff", color: "#5b21b6" },
  REJECTED:         { label: "Rejected",       bg: "#fef2f2", color: "#991b1b" },
  CANCELLED:        { label: "Cancelled",      bg: "#f9fafb", color: "#6b7280" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusCfg[status] ?? { label: status, bg: "var(--surface2)", color: "var(--text-muted)" };
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
  );
}

// ── Expandable order list panel ────────────────────────────────────────────────
function OrdersPanel({ type, orders }: { type: "credit" | "immediate"; orders: OrderItem[] }) {
  const [open, setOpen] = useState(false);
  if (orders.length === 0) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>;

  const isCredit = type === "credit";
  const accentBg     = isCredit ? "#eff6ff" : "#f0fdf4";
  const accentColor  = isCredit ? "#1d4ed8" : "#15803d";
  const accentBorder = isCredit ? "#bfdbfe" : "#bbf7d0";
  const dotColor     = isCredit ? "#2563eb" : "#16a34a";

  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all hover:opacity-80"
        style={{ background: accentBg, color: accentColor, border: `1px solid ${accentBorder}` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
        {orders.length} {isCredit ? "Credit" : "Immediate"}
        <svg className="w-3 h-3 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="mt-1.5 rounded-xl overflow-hidden border" style={{ borderColor: accentBorder }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ background: accentBg }}>
                    {["Order ID", "SAP Status", "Pay Term", "Cleared"].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left font-bold uppercase tracking-wider" style={{ color: accentColor }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, i) => (
                    <tr key={o.id} style={{ background: i % 2 === 0 ? "var(--surface)" : accentBg, borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--text)" }}>{o.orderId}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{o.orderStatus || "—"}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: accentBg, color: accentColor, border: `1px solid ${accentBorder}` }}>
                          {o.hstat || o.payTerm || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {o.isAssigned
                          ? <span className="text-green-600 font-bold text-[11px]">✓</span>
                          : <span className="text-red-400 font-bold text-[11px]">✗</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function OrdersReportPage() {
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "credit" | "immediate" | "both">("all");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/orders-report?${params}`)
      .then(r => r.ok ? r.json() : { report: [] })
      .then(d => { setRows(d.report ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [statusFilter, search]);

  const filtered = rows.filter(r => {
    if (typeFilter === "credit")    return r.creditCount > 0;
    if (typeFilter === "immediate") return r.immediateCount > 0;
    if (typeFilter === "both")      return r.creditCount > 0 && r.immediateCount > 0;
    return true;
  });

  const totalCredit    = filtered.reduce((s, r) => s + r.creditCount, 0);
  const totalImmediate = filtered.reduce((s, r) => s + r.immediateCount, 0);
  const withCredit     = filtered.filter(r => r.creditCount > 0).length;
  const withImmediate  = filtered.filter(r => r.immediateCount > 0).length;

  return (
    <>
      {/* Visible scrollbar style */}
      <style>{`
        .orders-scroll::-webkit-scrollbar { height: 8px; }
        .orders-scroll::-webkit-scrollbar-track { background: var(--surface2); border-radius: 999px; }
        .orders-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 999px; }
        .orders-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>

      <div className="w-full pb-10">
        {/* Page header — no Back button */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Vehicle Orders Report</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            After Sales MAIN OUT gate passes — credit &amp; immediate SAP order breakdown
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Vehicles",        value: filtered.length,              bg: "linear-gradient(135deg,#1e3a8a,#2563eb)", icon: "M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10zm0 0l2.5-2.5M13 8h4l3 3v5h-7V8z" },
            { label: "With Credit Orders",     value: withCredit,                   bg: "linear-gradient(135deg,#1e40af,#3b82f6)", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
            { label: "With Immediate Orders",  value: withImmediate,                bg: "linear-gradient(135deg,#065f46,#059669)", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 10v1m0-11c-1.11 0-2.08.402-2.599 1" },
            { label: "Total Orders",           value: totalCredit + totalImmediate, bg: "linear-gradient(135deg,#6d28d9,#8b5cf6)", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
          ].map(({ label, value, bg, icon }) => (
            <div key={label} className="rounded-2xl p-4 text-white overflow-hidden relative" style={{ background: bg }}>
              <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10 bg-white" />
              <svg className="w-5 h-5 mb-2 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
              </svg>
              <p className="text-2xl font-black leading-none">{loading ? "—" : value}</p>
              <p className="text-[11px] mt-1 opacity-80 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Breakdown bar */}
        {!loading && (totalCredit + totalImmediate) > 0 && (
          <div className="rounded-2xl border mb-5 p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Order Breakdown</p>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /><span style={{ color: "#1d4ed8" }}>Credit: {totalCredit}</span></span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /><span style={{ color: "#15803d" }}>Immediate: {totalImmediate}</span></span>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              <div className="rounded-l-full transition-all" style={{ width: `${Math.round((totalCredit / (totalCredit + totalImmediate)) * 100)}%`, background: "linear-gradient(90deg,#1e3a8a,#3b82f6)" }} />
              <div className="rounded-r-full transition-all flex-1" style={{ background: "linear-gradient(90deg,#059669,#10b981)" }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>{Math.round((totalCredit / (totalCredit + totalImmediate)) * 100)}% Credit</span>
              <span>{Math.round((totalImmediate / (totalCredit + totalImmediate)) * 100)}% Immediate</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0 border rounded-xl px-3 py-2"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search vehicle, GP no, chassis…"
              className="flex-1 text-sm bg-transparent focus:outline-none" style={{ color: "var(--text)" }} />
            {search && (
              <span role="button" onClick={() => setSearch("")}
                className="w-4 h-4 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: "var(--border)", color: "var(--text-muted)" }}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            )}
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm focus:outline-none"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="">All Statuses</option>
            <option value="CASHIER_REVIEW">Cashier Review</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="GATE_OUT">Gate Out</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            {(["all", "credit", "immediate", "both"] as const).map(t => (
              <button key={t} type="button" onClick={() => setTypeFilter(t)}
                className="px-3 py-2 text-xs font-bold transition-all capitalize"
                style={{
                  background: typeFilter === t ? (t === "credit" ? "#1d4ed8" : t === "immediate" ? "#15803d" : t === "both" ? "#6d28d9" : "var(--text)") : "var(--surface)",
                  color: typeFilter === t ? "white" : "var(--text-muted)",
                }}>
                {t === "both" ? "Both" : t === "all" ? "All" : t === "credit" ? "Credit" : "Immediate"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <svg className="w-12 h-12 mb-3" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>No vehicles found</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Try adjusting the filters</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto orders-scroll">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: "1200px" }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {[
                      "Vehicle", "Gate Pass", "Chassis", "Status",
                      "Departure Date", "Departure Time",
                      "From Location", "Live Location",
                      "Credit Orders", "Immediate Orders",
                      "Cashier", "Credit Approval", "Created By",
                    ].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, idx) => (
                    <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                      className="group"
                      style={{ background: idx % 2 === 0 ? "var(--surface)" : "var(--surface2)", borderBottom: "1px solid var(--border)" }}>

                      {/* Vehicle */}
                      <td className="px-3 py-3">
                        <Link href={`/gate-pass/${row.id}`} className="font-bold hover:underline whitespace-nowrap" style={{ color: "var(--text)" }}>
                          {row.vehicle}
                        </Link>
                        {row.make && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{row.make}</p>}
                      </td>

                      {/* Gate Pass */}
                      <td className="px-3 py-3">
                        <Link href={`/gate-pass/${row.id}`} className="font-mono text-xs font-bold hover:underline whitespace-nowrap" style={{ color: "#2563eb" }}>
                          {row.gatePassNumber}
                        </Link>
                        {row.serviceJobNo && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Job: {row.serviceJobNo}</p>}
                      </td>

                      {/* Chassis */}
                      <td className="px-3 py-3" style={{ maxWidth: 120 }}>
                        <span className="font-mono text-[10px] font-semibold block truncate" style={{ color: "var(--text)" }} title={row.chassis ?? ""}>
                          {row.chassis || "—"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={row.status} /></td>

                      {/* Departure Date */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.departureDate ? (
                          <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                            {new Date(row.departureDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        ) : <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>

                      {/* Departure Time */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.departureTime ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {row.departureTime}
                          </span>
                        ) : <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>

                      {/* From Location */}
                      <td className="px-3 py-3" style={{ maxWidth: 140 }}>
                        {row.fromLocation ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--text)" }} title={row.fromLocation}>
                            <svg className="w-3 h-3 flex-shrink-0" style={{ color: "#f59e0b" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="truncate block" style={{ maxWidth: 110 }}>{row.fromLocation}</span>
                          </span>
                        ) : <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>

                      {/* Live / Destination Location */}
                      <td className="px-3 py-3" style={{ maxWidth: 140 }}>
                        {row.toLocation ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--text)" }} title={row.toLocation}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: row.status === "GATE_OUT" ? "#22c55e" : "#94a3b8" }} />
                            <span className="truncate block" style={{ maxWidth: 110 }}>{row.toLocation}</span>
                          </span>
                        ) : <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>

                      {/* Credit Orders */}
                      <td className="px-3 py-3"><OrdersPanel type="credit" orders={row.creditOrders} /></td>

                      {/* Immediate Orders */}
                      <td className="px-3 py-3"><OrdersPanel type="immediate" orders={row.immediateOrders} /></td>

                      {/* Cashier Cleared */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {row.immediateCount === 0 ? (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>N/A</span>
                        ) : row.cashierCleared ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#dcfce7", color: "#15803d" }}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            Cleared
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Credit Approved */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {row.creditCount === 0 ? (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>N/A</span>
                        ) : row.creditApproved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#dcfce7", color: "#15803d" }}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Created By */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{row.createdBy.name}</span>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {new Date(row.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </p>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
