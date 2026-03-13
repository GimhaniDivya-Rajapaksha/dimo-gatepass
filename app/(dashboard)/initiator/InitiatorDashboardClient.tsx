"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

type GatePass = {
  id: string; gatePassNumber: string; passType: string; passSubType: string | null; status: string;
  vehicle: string; chassis: string | null; departureDate: string | null;
  requestedBy: string | null; toLocation: string | null; vehicleDetails: string | null;
  createdBy: { name: string }; createdAt: string;
  parentPass: { id: string; gatePassNumber: string; passSubType: string | null } | null;
};

type Stats = { pending: number; approved: number; rejected: number; gateOut: number; completed: number; total: number };

interface Props {
  user: { name?: string | null; email?: string | null; role: string | null };
}

const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
  APPROVED:         { label: "Approved",          bg: "rgba(16,185,129,0.12)",  color: "#10b981" },
  REJECTED:         { label: "Rejected",          bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",           bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
  COMPLETED:        { label: "Completed",          bg: "rgba(139,92,246,0.12)", color: "#8b5cf6" },
  CASHIER_REVIEW:   { label: "Cashier Review",      bg: "rgba(245,158,11,0.12)",  color: "#b45309" },
};

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (value === 0) { setDisplay(0); return; }
    const duration = 750;
    let startTime: number | null = null;

    function step(ts: number) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(value * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <span className="tabular-nums">{display}</span>;
}

function StatCard({ label, value, accentColor, icon, filter, activeFilter, onFilter, delay, loading }: {
  label: string; value: number; accentColor: string;
  icon: React.ReactNode; filter: string; activeFilter: string;
  onFilter: (f: string) => void; delay: number; loading: boolean;
}) {
  const isActive = activeFilter === filter;
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 200, damping: 22 }}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onFilter(isActive ? "ALL" : filter)}
      className="relative text-left rounded-2xl overflow-hidden w-full"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isActive ? accentColor + "66" : "var(--border)"}`,
        boxShadow: isActive
          ? `0 0 0 2px ${accentColor}22, 0 8px 32px ${accentColor}18, var(--card-shadow)`
          : "var(--card-shadow)",
      }}
    >
      {/* Corner glow */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
        style={{ background: accentColor, opacity: isActive ? 0.18 : 0.07 }}
      />
      {/* Top gradient stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}22)` }}
      />

      <div className="relative px-5 pt-5 pb-4">
        {/* Label + Icon */}
        <div className="flex items-start justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest leading-tight pr-2" style={{ color: "var(--text-muted)" }}>
            {label}
          </p>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${accentColor}18`, color: accentColor }}
          >
            {icon}
          </div>
        </div>

        {/* Number */}
        <div className="mb-4 h-12 flex items-center">
          {loading ? (
            <div className="skeleton h-10 w-14 rounded-xl" />
          ) : (
            <AnimatePresence mode="wait">
              <motion.p
                key={value}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-black leading-none"
                style={{ color: "var(--text)" }}
              >
                <AnimatedNumber value={value} />
              </motion.p>
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="border-t pt-3 flex items-center gap-1.5 min-h-[20px]" style={{ borderColor: "var(--border)" }}>
          {loading ? (
            <div className="skeleton h-3 w-20 rounded" />
          ) : isActive ? (
            <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: accentColor }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Filtered
            </span>
          ) : (
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Click to filter →</span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default function InitiatorDashboardClient({ user }: Props) {
  const router = useRouter();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, approved: 0, rejected: 0, gateOut: 0, completed: 0, total: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch real stats separately
  useEffect(() => {
    fetch("/api/gate-pass/stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, []);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "10" });
    if (search) params.set("search", search);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const d = await res.json();
        setPasses(d.passes || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const statCards = [
    {
      label: "Pending Approval", value: stats.pending, filter: "PENDING_APPROVAL",
      accentColor: "#f59e0b",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: "Approved", value: stats.approved, filter: "APPROVED",
      accentColor: "#10b981",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: "Rejected", value: stats.rejected, filter: "REJECTED",
      accentColor: "#ef4444",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: "Gate Out", value: stats.gateOut, filter: "GATE_OUT",
      accentColor: "#3b82f6",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--lime)" }}>
            Gate Pass Initiator
          </p>
          <h1 className="text-3xl font-bold title-font leading-tight gradient-text">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
        </div>
        <Link
          href="/gate-pass/create"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity mt-1"
          style={{ background: "#1B2B5E" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Create Pass
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s, i) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            accentColor={s.accentColor}
            icon={s.icon}
            filter={s.filter}
            activeFilter={statusFilter}
            onFilter={setStatusFilter}
            delay={i * 0.07}
            loading={statsLoading}
          />
        ))}
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b gap-4 flex-wrap" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--lime)" }} />
              <h2 className="font-bold text-sm title-font" style={{ color: "var(--text)" }}>My Gate Passes</h2>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              {total} total
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search GP, vehicle..."
                className="border rounded-xl px-4 py-2 pr-9 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 w-52"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="ALL">All Status</option>
              {Object.entries(statusCfg).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

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
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3.5"><div className="skeleton h-4 w-14 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="skeleton h-4 w-20 rounded" /></td>
                    <td className="px-4 py-3.5">
                      <div className="skeleton h-4 w-28 rounded mb-1.5" />
                      <div className="skeleton h-3 w-20 rounded" />
                    </td>
                    <td className="px-4 py-3.5"><div className="skeleton h-4 w-24 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="skeleton h-4 w-20 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="skeleton h-4 w-16 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="skeleton h-6 w-24 rounded-full" /></td>
                  </tr>
                ))
              ) : passes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "var(--surface2)" }}>📋</div>
                      <p className="text-sm font-medium">No gate passes found</p>
                      <Link href="/gate-pass/create" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                        Create your first gate pass →
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                passes.map((p, i) => {
                  const sc = statusCfg[p.status] || statusCfg["PENDING_APPROVAL"];
                  const canPrint = p.status === "APPROVED" || p.status === "GATE_OUT" || p.status === "COMPLETED";
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="group transition-colors"
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => router.push(`/gate-pass/${p.id}`)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all hover:shadow-sm"
                            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--accent)" }}
                            title="View"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => canPrint && router.push(`/gate-pass/${p.id}?print=1`)}
                            disabled={!canPrint}
                            className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                            style={{
                              background: canPrint ? "var(--surface)" : "var(--surface2)",
                              borderColor: canPrint ? "#10b981" : "var(--border)",
                              color: canPrint ? "#10b981" : "var(--text-muted)",
                              opacity: canPrint ? 1 : 0.4,
                              cursor: canPrint ? "pointer" : "not-allowed",
                            }}
                            title={canPrint ? "Print Gate Pass" : "Available after approval"}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-xs" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</span>
                        {p.passSubType && (
                          <span className="block text-xs mt-0.5 font-semibold" style={{ color: p.passSubType === "MAIN_IN" ? "#059669" : p.passSubType === "MAIN_OUT" ? "#7c3aed" : "#d97706" }}>
                            {p.passSubType.replace("_", " ")}
                          </span>
                        )}
                        {p.parentPass && (
                          <span className="block text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>↳ {p.parentPass.gatePassNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                        {p.chassis && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.toLocation || p.vehicleDetails || "-"}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.requestedBy || p.createdBy.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{p.departureDate || "-"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.color }} />
                          {sc.label}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

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

    </motion.div>
  );
}
