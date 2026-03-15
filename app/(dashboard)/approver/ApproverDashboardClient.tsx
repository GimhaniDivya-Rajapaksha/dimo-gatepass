"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

type Stats = { pending: number; approved: number; rejected: number; gateOut: number; completed: number; total: number };

type GatePass = {
  id: string; gatePassNumber: string; passType: string; passSubType: string | null; status: string;
  vehicle: string; chassis: string | null; serviceJobNo: string | null;
  requestedBy: string | null; toLocation: string | null;
  createdBy: { name: string }; createdAt: string;
};

interface Props {
  user: { name?: string | null; email?: string | null; role: string | null };
}

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

function StatCard({ label, value, accentColor, icon, loading }: {
  label: string; value: number; accentColor: string; icon: React.ReactNode; loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Corner glow */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
        style={{ background: accentColor, opacity: 0.08 }}
      />
      {/* Top gradient stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}22)` }}
      />

      <div className="relative px-5 pt-5 pb-4">
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

        <div className="border-t pt-3 min-h-[20px]" style={{ borderColor: "var(--border)" }}>
          {loading ? (
            <div className="skeleton h-3 w-16 rounded" />
          ) : (
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Total records</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function ApproverDashboardClient({ user }: Props) {
  const [stats, setStats] = useState<Stats>({ pending: 0, approved: 0, rejected: 0, gateOut: 0, completed: 0, total: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [queue, setQueue] = useState<GatePass[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gate-pass/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setStats(d); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await fetch("/api/gate-pass?status=PENDING_APPROVAL&limit=8");
      if (res.ok) {
        const d = await res.json();
        setQueue(d.passes || []);
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const statCards = [
    {
      label: "Pending Approval", value: stats.pending, accentColor: "#f59e0b",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: "Approved", value: stats.approved, accentColor: "#10b981",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: "Rejected", value: stats.rejected, accentColor: "#ef4444",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: "Completed", value: stats.completed, accentColor: "#8b5cf6",
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
    },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--lime)" }}>
            Approver
          </p>
          <h1 className="text-3xl font-bold title-font leading-tight gradient-text">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
          {!statsLoading && stats.pending > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm mt-1 font-medium flex items-center gap-1.5"
              style={{ color: "#f59e0b" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 float-pulse" />
              {stats.pending} gate pass{stats.pending > 1 ? "es" : ""} awaiting your approval
            </motion.p>
          )}
          {!statsLoading && stats.pending === 0 && (
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>All clear — no pending approvals</p>
          )}
        </div>
        <Link
          href="/gate-pass/approve"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity mt-1"
          style={{ background: "#B5CC18", color: "#0F1A3E" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Review Queue
          {!statsLoading && stats.pending > 0 && (
            <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(15,26,62,0.25)", color: "#0F1A3E" }}>
              {stats.pending}
            </span>
          )}
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s, i) => (
          <motion.div key={s.label} transition={{ delay: i * 0.07 }}>
            <StatCard
              label={s.label}
              value={s.value}
              accentColor={s.accentColor}
              icon={s.icon}
              loading={statsLoading}
            />
          </motion.div>
        ))}
      </div>

      {/* Pending Queue Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--lime)" }} />
              <h2 className="font-bold text-sm title-font" style={{ color: "var(--text)" }}>Pending Approvals Queue</h2>
            </div>
            {!queueLoading && queue.length > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}
              >
                {queue.length}
              </span>
            )}
          </div>
          <Link
            href="/gate-pass/approve"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "var(--accent)", background: "var(--surface2)" }}
          >
            View all →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                {["Gate Pass No", "Vehicle", "From", "Requested By", "Action"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queueLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-3.5"><div className="skeleton h-4 w-20 rounded" /></td>
                    <td className="px-5 py-3.5">
                      <div className="skeleton h-4 w-28 rounded mb-1.5" />
                      <div className="skeleton h-3 w-20 rounded" />
                    </td>
                    <td className="px-5 py-3.5"><div className="skeleton h-4 w-24 rounded" /></td>
                    <td className="px-5 py-3.5"><div className="skeleton h-4 w-20 rounded" /></td>
                    <td className="px-5 py-3.5"><div className="skeleton h-7 w-16 rounded-lg" /></td>
                  </tr>
                ))
              ) : queue.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--surface2)" }}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text-muted)" }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No pending approvals</p>
                    </div>
                  </td>
                </tr>
              ) : (
                queue.map((gp, i) => (
                  <motion.tr
                    key={gp.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-bold text-xs" style={{ color: "var(--accent)" }}>{gp.gatePassNumber}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{gp.vehicle}</p>
                      {gp.chassis && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{gp.chassis}</p>}
                      {gp.passSubType === "MAIN_OUT" && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: "#fef3c7", color: "#b45309" }}>
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          Partial Payment — Needs Special Approval
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: "var(--text)" }}>
                      {gp.toLocation || gp.requestedBy || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: "var(--text)" }}>
                      {gp.createdBy.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/gate-pass/${gp.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                        style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Review
                      </Link>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </motion.div>
  );
}
