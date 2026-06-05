"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";

// ── Animated number (count-up) ────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 18, duration });
  const rounded = useTransform(spring, v => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => {
    const unsub = rounded.on("change", v => setDisplay(v));
    return unsub;
  }, [rounded]);

  return <span>{display}</span>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RecentPass = {
  id: string;
  gatePassNumber: string;
  passType: string;
  passSubType: string | null;
  status: string;
  vehicle: string;
  chassis: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  updatedAt: string;
  createdAt: string;
  createdBy: { name: string };
};

type Stats = {
  location: string | null;
  totalAll: number;
  totalToday: number;
  pendingApproval: number;
  gateOut: number;
  completedToday: number;
  inTransitToLocation: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  recentPasses: RecentPass[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", color: "#c2410c", bg: "#fff7ed", dot: "#f97316" },
  APPROVED:         { label: "Approved",          color: "#15803d", bg: "#f0fdf4", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",          color: "#991b1b", bg: "#fef2f2", dot: "#ef4444" },
  INITIATOR_OUT:    { label: "Initiator Confirmed", color: "#6d28d9", bg: "#f5f3ff", dot: "#a855f7" },
  GATE_OUT:         { label: "Gate Out",          color: "#1d4ed8", bg: "#eff6ff", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",         color: "#5b21b6", bg: "#f5f3ff", dot: "#8b5cf6" },
  CANCELLED:        { label: "Cancelled",         color: "#6b7280", bg: "#f9fafb", dot: "#9ca3af" },
  CASHIER_REVIEW:   { label: "Cashier Review",    color: "#b45309", bg: "#fef3c7", dot: "#f59e0b" },
  DRAFT:            { label: "Draft",             color: "#92400e", bg: "#fffbeb", dot: "#f59e0b" },
};

const TYPE_CFG: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  LOCATION_TRANSFER: { label: "Location Transfer", color: "#1d4ed8", bg: "#eff6ff", bar: "#3b82f6" },
  CUSTOMER_DELIVERY: { label: "Customer Delivery", color: "#15803d", bg: "#f0fdf4", bar: "#22c55e" },
  AFTER_SALES:       { label: "After Sales",       color: "#7c3aed", bg: "#f5f3ff", bar: "#a855f7" },
};

const PIPELINE = ["PENDING_APPROVAL", "APPROVED", "GATE_OUT", "COMPLETED"] as const;
const PIPELINE_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Pending",
  APPROVED:         "Approved",
  GATE_OUT:         "Gate Out",
  COMPLETED:        "Completed",
};
const PIPELINE_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#8b5cf6"];

function fmtRelative(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)  return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ── Mini SVG Donut ────────────────────────────────────────────────────────────

function DonutChart({ slices, size = 80 }: {
  slices: { value: number; color: string }[];
  size?: number;
}) {
  const total = slices.reduce((s, v) => s + v.value, 0);
  if (total === 0) return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--border)" strokeWidth="7" />
    </svg>
  );
  const r = 12; const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ transform: "rotate(-90deg)" }}>
      {slices.map((s, i) => {
        const dash = (s.value / total) * circ;
        const el = (
          <circle key={i} cx="16" cy="16" r={r} fill="none"
            stroke={s.color} strokeWidth="7"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ── Shimmer skeleton ─────────────────────────────────────────────────────────

function Shimmer({ h = "h-8", w = "w-full", rounded = "rounded-xl" }: { h?: string; w?: string; rounded?: string }) {
  return (
    <div className={`${h} ${w} ${rounded} overflow-hidden relative`} style={{ background: "var(--border)" }}>
      <motion.div
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.18) 50%,transparent 100%)" }}
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function KPICardSkeleton({ accent }: { accent: string }) {
  return (
    <div className="relative rounded-2xl border overflow-hidden p-5 flex flex-col gap-3"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `${accent}44` }} />
      <div className="flex items-start justify-between">
        <Shimmer h="h-3" w="w-24" rounded="rounded" />
        <div className="w-9 h-9 rounded-xl" style={{ background: `${accent}18` }} />
      </div>
      <Shimmer h="h-10" w="w-16" rounded="rounded-lg" />
      <Shimmer h="h-3" w="w-32" rounded="rounded" />
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, accent, icon, pulse, delay = 0 }: {
  label: string; value: number; sub?: string;
  accent: string; icon: React.ReactNode; pulse?: boolean; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 160, damping: 20 }}
      className="relative rounded-2xl border overflow-hidden p-5 flex flex-col gap-2"
      style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}
    >
      <motion.div
        className="absolute top-0 left-0 right-0 h-1"
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: delay + 0.2, duration: 0.5 }}
        style={{ background: `linear-gradient(90deg,${accent},${accent}44)` }}
      />
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest leading-tight" style={{ color: "var(--text-muted)" }}>{label}</p>
        <motion.div
          initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: delay + 0.15, type: "spring", stiffness: 200 }}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}18`, color: accent }}>
          {icon}
        </motion.div>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-4xl font-black leading-none" style={{ color: "var(--text)" }}>
          <AnimatedNumber value={value} />
        </p>
        {pulse && value > 0 && (
          <span className="mb-1 w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
        )}
      </div>
      {sub && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DeliveryCoordinatorDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "loading" && session?.user?.role !== "DELIVERY_COORDINATOR") {
      router.replace("/");
    }
  }, [status, session, router]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery-coordinator/stats");
      if (res.ok) {
        setStats(await res.json());
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => void fetchStats(), 60_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  if (status === "loading" || loading) {
    const ACCENTS = ["#0d9488", "#f97316", "#3b82f6", "#8b5cf6", "#22c55e"];
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {ACCENTS.map((accent, i) => <KPICardSkeleton key={i} accent={accent} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <Shimmer h="h-5" w="w-40" rounded="rounded mb-4" />
            <div className="flex gap-2">{Array.from({length:4}).map((_,i)=><Shimmer key={i} h="h-20" rounded="rounded-xl flex-1" />)}</div>
          </div>
          <div className="lg:col-span-2 rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <Shimmer h="h-5" w="w-32" rounded="rounded mb-4" />
            <div className="flex justify-center mb-4"><Shimmer h="h-28" w="w-28" rounded="rounded-full" /></div>
            {Array.from({length:3}).map((_,i)=><Shimmer key={i} h="h-4" rounded="rounded mb-2" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const totalByStatus = Object.values(stats.byStatus).reduce((s, v) => s + v, 0);
  const totalByType = Object.values(stats.byType).reduce((s, v) => s + v, 0);

  const typeSlices = Object.entries(TYPE_CFG).map(([key, cfg]) => ({
    value: stats.byType[key] ?? 0,
    color: cfg.bar,
    label: cfg.label,
    bg: cfg.bg,
    textColor: cfg.color,
  }));

  const filteredRecent = activeStatusFilter
    ? stats.recentPasses.filter(p => p.status === activeStatusFilter)
    : stats.recentPasses;

  const pendingPasses = stats.recentPasses.filter(p =>
    ["PENDING_APPROVAL", "CASHIER_REVIEW"].includes(p.status)
  );
  const activeGateOut = stats.recentPasses.filter(p => p.status === "GATE_OUT");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#0d9488" }}>
            Delivery Coordinator
          </p>
          <h1 className="text-3xl font-black gradient-text title-font leading-tight">
            Location Overview
          </h1>
          {stats.location && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#0d9488" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>{stats.location}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Updated {fmtTime(lastRefresh.toISOString())}
          </span>
          <Link href="/delivery-coordinator/guide"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all hover:opacity-80"
            style={{ background: "#f0fdfa", borderColor: "#99f6e4", color: "#0d9488" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How It Works
          </Link>
          <button onClick={() => void fetchStats()}
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard label="Total Today" value={stats.totalToday} sub="gate passes created" accent="#0d9488" delay={0}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <KPICard label="Pending Approval" value={stats.pendingApproval} sub="awaiting review" accent="#f97316" pulse delay={0.07}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard label="Gate Out" value={stats.gateOut} sub="vehicles in transit" accent="#3b82f6" pulse delay={0.14}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}
        />
        <KPICard label="Completed Today" value={stats.completedToday} sub="successfully closed" accent="#8b5cf6" delay={0.21}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KPICard label="Arriving Here" value={stats.inTransitToLocation} sub="vehicles en route" accent="#22c55e" pulse delay={0.28}
          icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" /></svg>}
        />
      </div>

      {/* ── Status Pipeline + Type Breakdown ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Status Pipeline (3/5) */}
        <div className="lg:col-span-3 rounded-2xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>Pass Status Pipeline</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              {totalByStatus} total
            </span>
          </div>

          {/* Pipeline flow arrows */}
          <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
            {PIPELINE.map((st, idx) => {
              const count = stats.byStatus[st] ?? 0;
              const pct = totalByStatus > 0 ? Math.round((count / totalByStatus) * 100) : 0;
              return (
                <div key={st} className="flex items-center gap-1 flex-1 min-w-0">
                  <div className="flex-1 min-w-0 rounded-xl p-3 text-center cursor-pointer transition-all hover:opacity-80"
                    onClick={() => setActiveStatusFilter(prev => prev === st ? null : st)}
                    style={{
                      background: activeStatusFilter === st ? `${PIPELINE_COLORS[idx]}22` : "var(--surface2)",
                      border: `2px solid ${activeStatusFilter === st ? PIPELINE_COLORS[idx] : "var(--border)"}`,
                    }}>
                    <p className="text-2xl font-black" style={{ color: PIPELINE_COLORS[idx] }}>{count}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {PIPELINE_LABELS[st]}
                    </p>
                    <p className="text-[10px] font-semibold mt-0.5" style={{ color: PIPELINE_COLORS[idx] }}>{pct}%</p>
                  </div>
                  {idx < PIPELINE.length - 1 && (
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>

          {/* Other statuses row */}
          <div className="flex flex-wrap gap-2">
            {["REJECTED", "CANCELLED", "CASHIER_REVIEW", "DRAFT", "INITIATOR_OUT"].map(st => {
              const count = stats.byStatus[st] ?? 0;
              if (count === 0) return null;
              const cfg = STATUS_CFG[st];
              return (
                <button key={st}
                  onClick={() => setActiveStatusFilter(prev => prev === st ? null : st)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: activeStatusFilter === st ? cfg.bg : "var(--surface2)",
                    color: activeStatusFilter === st ? cfg.color : "var(--text-muted)",
                    border: `1px solid ${activeStatusFilter === st ? cfg.dot : "var(--border)"}`,
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                  {cfg.label} · {count}
                </button>
              );
            })}
            {activeStatusFilter && (
              <button onClick={() => setActiveStatusFilter(null)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                ✕ Clear filter
              </button>
            )}
          </div>
        </div>

        {/* Pass Type Distribution (2/5) */}
        <div className="lg:col-span-2 rounded-2xl border p-5 flex flex-col gap-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>Pass Type Distribution</h2>

          <div className="flex items-center justify-center">
            <DonutChart
              slices={typeSlices.map(s => ({ value: s.value, color: s.color }))}
              size={110}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            {typeSlices.map(s => {
              const pct = totalByType > 0 ? Math.round((s.value / totalByType) * 100) : 0;
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{s.label}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: s.textColor }}>{s.value}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Needs Attention + Vehicles in Transit ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Needs Attention */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "#f9731633", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b"
            style={{ background: "linear-gradient(135deg,#fff7ed,#fef3c722)", borderColor: "#fed7aa" }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#f97316" }} />
              <h2 className="font-bold text-sm" style={{ color: "#c2410c" }}>Needs Attention</h2>
              {pendingPasses.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "#f97316", color: "#fff" }}>
                  {pendingPasses.length}
                </span>
              )}
            </div>
            <Link href="/gate-pass?status=PENDING_APPROVAL"
              className="text-xs font-semibold hover:opacity-70" style={{ color: "#c2410c" }}>
              View all →
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {pendingPasses.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: "#f0fdf4" }}>
                  <svg className="w-5 h-5" style={{ color: "#22c55e" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>All clear — nothing pending</p>
              </div>
            ) : (
              pendingPasses.slice(0, 6).map(p => {
                const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.PENDING_APPROVAL;
                return (
                  <Link key={p.id} href={`/gate-pass/${p.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:opacity-80 transition-opacity">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</span>
                        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{p.vehicle}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                        {p.fromLocation || "?"} → {p.toLocation || "?"} · {fmtRelative(p.updatedAt)}
                      </p>
                    </div>
                    <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-40" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Vehicles in Transit */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "#3b82f633", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b"
            style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe22)", borderColor: "#bfdbfe" }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#3b82f6" }} />
              <h2 className="font-bold text-sm" style={{ color: "#1d4ed8" }}>Vehicles in Transit</h2>
              {activeGateOut.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "#3b82f6", color: "#fff" }}>
                  {activeGateOut.length}
                </span>
              )}
            </div>
            <Link href="/gate-pass?status=GATE_OUT"
              className="text-xs font-semibold hover:opacity-70" style={{ color: "#1d4ed8" }}>
              View all →
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {activeGateOut.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>No vehicles currently in transit</p>
              </div>
            ) : (
              activeGateOut.slice(0, 6).map(p => (
                <Link key={p.id} href={`/gate-pass/${p.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:opacity-80 transition-opacity">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "#dbeafe" }}>
                    <svg className="w-4 h-4" style={{ color: "#1d4ed8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 8h4l3 3v5h-7V8z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</span>
                      <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{p.vehicle}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>
                        {p.fromLocation || "?"}
                      </span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                        {p.toLocation || "?"}
                      </span>
                      <span className="ml-1 opacity-60">· {fmtRelative(p.updatedAt)}</span>
                    </div>
                  </div>
                  <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-40" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Activity Feed ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-wrap gap-3"
          style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-sm" style={{ color: "var(--text)" }}>Recent Activity</h2>
            {activeStatusFilter && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: STATUS_CFG[activeStatusFilter]?.bg, color: STATUS_CFG[activeStatusFilter]?.color }}>
                Filtered: {STATUS_CFG[activeStatusFilter]?.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {filteredRecent.length} passes
            </span>
            <Link href="/gate-pass"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)" }}>
              View all passes →
            </Link>
          </div>
        </div>

        {filteredRecent.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No passes match the current filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["GP No", "Vehicle / Chassis", "Type", "Route", "Status", "By", "Updated"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest"
                      style={{ color: "var(--text-muted)", background: "var(--surface2)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                <AnimatePresence>
                  {filteredRecent.map((p, i) => {
                    const sc = STATUS_CFG[p.status] ?? STATUS_CFG.PENDING_APPROVAL;
                    const tc = TYPE_CFG[p.passType];
                    return (
                      <motion.tr key={p.id}
                        initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                        onClick={() => router.push(`/gate-pass/${p.id}`)}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>
                            {p.gatePassNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold leading-tight" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                          {p.chassis && <p className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold"
                            style={{ background: tc?.bg ?? "var(--surface2)", color: tc?.color ?? "var(--text-muted)" }}>
                            {tc?.label ?? p.passType.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                            <span className="max-w-[70px] truncate">{p.fromLocation || "—"}</span>
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            <span className="max-w-[70px] truncate font-medium" style={{ color: "var(--text)" }}>
                              {p.toLocation || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                            style={{ background: sc.bg, color: sc.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                          {p.createdBy.name}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {fmtRelative(p.updatedAt)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── All-Time Summary ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>All-Time Status Breakdown</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {Object.entries(STATUS_CFG).map(([key, cfg]) => {
            const count = stats.byStatus[key] ?? 0;
            const pct = totalByStatus > 0 ? (count / totalByStatus) * 100 : 0;
            return (
              <div key={key} className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    {cfg.label}
                  </span>
                </div>
                <p className="text-2xl font-black" style={{ color: cfg.color }}>{count}</p>
                <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cfg.dot }} />
                </div>
                <p className="text-[10px] mt-1 font-semibold" style={{ color: "var(--text-muted)" }}>
                  {Math.round(pct)}%
                </p>
              </div>
            );
          })}
        </div>
      </div>

    </motion.div>
  );
}
