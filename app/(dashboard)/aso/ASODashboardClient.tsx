"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  user: {
    name?: string | null;
    email?: string | null;
    role: string | null;
    defaultLocation?: string | null;
  };
}

type IncomingVehicle = {
  id: string;
  gatePassNumber: string;
  vehicle: string;
  chassis: string | null;
  status: string;
  make: string | null;
  vehicleColor: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  departureDate: string | null;
  requestedBy: string | null;
  serviceJobNo: string | null;
  createdBy: { name: string };
  parentPass: { id: string; gatePassNumber: string; serviceJobNo: string | null } | null;
  hasActiveSubIn?: boolean;
};

type MyPass = {
  id: string;
  gatePassNumber: string;
  passSubType: string | null;
  status: string;
  vehicle: string;
  chassis: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  departureDate: string | null;
  serviceJobNo: string | null;
  createdAt: string;
  parentPass: { id: string; gatePassNumber: string } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
  APPROVED:         { label: "Approved",          bg: "#d1fae5", color: "#065f46", dot: "#10b981" },
  REJECTED:         { label: "Rejected",          bg: "#fee2e2", color: "#991b1b", dot: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",           bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",          bg: "#ede9fe", color: "#5b21b6", dot: "#8b5cf6" },
  CASHIER_REVIEW:   { label: "Cashier Review",     bg: "#fef3c7", color: "#b45309", dot: "#d97706" },
};

const subTypeCfg: Record<string, { label: string; bg: string; color: string }> = {
  SUB_OUT:    { label: "Sub Out",    bg: "#dbeafe", color: "#1e40af" },
  SUB_IN:     { label: "Sub In",     bg: "#d1fae5", color: "#065f46" },
  SUB_OUT_IN: { label: "Sub OUT/IN", bg: "#ffedd5", color: "#c2410c" },
  MAIN_OUT:   { label: "Main Out",   bg: "#ede9fe", color: "#5b21b6" },
  MAIN_IN:    { label: "Main In",    bg: "#fce7f3", color: "#9d174d" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusCfg[status] ?? { label: status, bg: "#f1f5f9", color: "#475569", dot: "#94a3b8" };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ background: cfg.bg, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

function SubTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const cfg = subTypeCfg[type] ?? { label: type, bg: "#f1f5f9", color: "#475569" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ASODashboardClient({ user }: Props) {
  const [incoming, setIncoming] = useState<IncomingVehicle[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(true);

  const [myPasses, setMyPasses] = useState<MyPass[]>([]);
  const [myTotal, setMyTotal] = useState(0);
  const [myPages, setMyPages] = useState(1);
  const [myPage, setMyPage] = useState(1);
  const [myLoading, setMyLoading] = useState(true);
  const [subTypeFilter, setSubTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [actioningId, setActioningId] = useState<string | null>(null);

  // ── Stats derived from incoming + myPasses ─────────────────────────────────
  const incomingCount = incoming.length;
  // All vehicles in GATE_OUT are physically en route
  const inTransit = incoming.length;

  // ── Fetch incoming vehicles ─────────────────────────────────────────────────
  const fetchIncoming = useCallback(async () => {
    setIncomingLoading(true);
    try {
      // Show GATE_OUT SUB_OUT passes — Security A confirmed Gate OUT, vehicle is en route to ASO
      const outParams = new URLSearchParams({
        passType: "AFTER_SALES", passSubType: "SUB_OUT",
        status: "GATE_OUT", limit: "50", locationView: "true",
      });
      if (user.defaultLocation) outParams.set("toLocation", user.defaultLocation);

      // Also fetch APPROVED SUB_IN passes to detect which vehicles already have a sub-in created
      const [outRes, subInRes] = await Promise.all([
        fetch(`/api/gate-pass?${outParams}`),
        fetch("/api/gate-pass?status=APPROVED&passType=AFTER_SALES&passSubType=SUB_IN&limit=100"),
      ]);
      if (!outRes.ok) { setIncoming([]); return; }

      const [outData, subInData] = await Promise.all([outRes.json(), subInRes.ok ? subInRes.json() : { passes: [] }]);

      // Build a set of parent pass IDs that already have an APPROVED SUB_IN
      const existingSubInParents = new Set<string>(
        (subInData.passes ?? []).map((p: any) => p.parentPassId).filter(Boolean)
      );

      setIncoming((outData.passes || []).map((p: IncomingVehicle) => ({
        ...p,
        // Mark if a SUB_IN pass already exists for this vehicle's parent MAIN_IN
        hasActiveSubIn: existingSubInParents.has(p.parentPass?.id ?? "") || existingSubInParents.has(p.id),
      })));
    } catch {
      setIncoming([]);
    } finally {
      setIncomingLoading(false);
    }
  }, [user.defaultLocation]);

  // ── Fetch my sub-passes ─────────────────────────────────────────────────────
  const fetchMyPasses = useCallback(async () => {
    setMyLoading(true);
    const params = new URLSearchParams({ passType: "AFTER_SALES", page: String(myPage), limit: "10" });
    if (subTypeFilter !== "ALL") params.set("passSubType", subTypeFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const d = await res.json();
        setMyPasses(d.passes || []);
        setMyTotal(d.total || 0);
        setMyPages(d.totalPages || 1);
      } else {
        setMyPasses([]);
        setMyTotal(0);
        setMyPages(1);
      }
    } catch {
      setMyPasses([]);
      setMyTotal(0);
      setMyPages(1);
    } finally {
      setMyLoading(false);
    }
  }, [myPage, subTypeFilter, statusFilter]);

  const handlePassAction = useCallback(async (id: string, action: "gate_out" | "gate_in", label: string) => {
    if (!confirm(`${label}?`)) return;
    setActioningId(id);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchMyPasses();
        await fetchIncoming();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Action failed: ${err.error || res.statusText}`);
      }
    } catch {
      alert("Network error — please try again.");
    } finally {
      setActioningId(null);
    }
  }, [fetchMyPasses, fetchIncoming]);

  // Create a SUB_IN pass for the incoming vehicle — Security B will then confirm Gate IN
  const handleCreateSubIn = useCallback(async (v: IncomingVehicle) => {
    if (!confirm("Create Sub IN pass for this vehicle? Security Officer will confirm Gate IN when the vehicle arrives.")) return;
    setActioningId(v.id);
    try {
      const res = await fetch("/api/gate-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passType: "AFTER_SALES",
          passSubType: "SUB_IN",
          parentPassId: v.parentPass?.id ?? v.id,
          vehicle: v.vehicle,
          chassis: v.chassis,
          make: v.make,
          vehicleColor: v.vehicleColor,
          fromLocation: v.toLocation,   // vehicle is coming from ASO (= the SUB_OUT's toLocation)
          toLocation: v.fromLocation,   // heading back toward DIMO (= the SUB_OUT's fromLocation)
          serviceJobNo: v.serviceJobNo ?? v.parentPass?.serviceJobNo,
          requestedBy: v.requestedBy,
        }),
      });
      if (res.ok) {
        await fetchIncoming();
        await fetchMyPasses();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to create Sub IN pass: ${err.error || res.statusText}`);
      }
    } catch {
      alert("Network error — please try again.");
    } finally {
      setActioningId(null);
    }
  }, [fetchIncoming, fetchMyPasses]);

  useEffect(() => { void fetchIncoming(); }, [fetchIncoming]);
  useEffect(() => { void fetchMyPasses(); }, [fetchMyPasses]);
  useEffect(() => { setMyPage(1); }, [subTypeFilter, statusFilter]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
      className="flex flex-col gap-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1"
            style={{ color: "var(--lime)" }}>Area Sales Officer</p>
          <h1 className="text-3xl font-bold title-font gradient-text leading-tight">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
          {user.defaultLocation && (
            <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {user.defaultLocation}
            </p>
          )}
        </div>
        <Link href="/gate-pass/create"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0 mt-1"
          style={{ background: "#1B2B5E" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Create Sub-Pass
        </Link>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Vehicles Incoming",
            value: incomingCount,
            accent: "#3b82f6",
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 8l-4 4m0 0l4 4m-4-4h18" />
              </svg>
            ),
            sub: "awaiting SUB IN",
          },
          {
            label: "In Transit",
            value: inTransit,
            accent: "#8b5cf6",
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ),
            sub: "physically en route",
          },
          {
            label: "My Total Passes",
            value: myLoading ? 0 : myTotal,
            accent: "#10b981",
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            ),
            sub: "sub-passes created",
          },
          {
            label: "Pending Approval",
            value: myLoading ? 0 : myPasses.filter(p => p.status === "PENDING_APPROVAL").length,
            accent: "#f59e0b",
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
            sub: "awaiting approver",
          },
        ].map((s, i) => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: "spring", stiffness: 200, damping: 22 }}
            className="relative rounded-2xl overflow-hidden border p-5"
            style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
            {/* Top stripe */}
            <div className="absolute top-0 left-0 right-0 h-0.5 pointer-events-none"
              style={{ background: `linear-gradient(90deg,${s.accent},${s.accent}22)` }} />
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-widest leading-tight"
                style={{ color: "var(--text-muted)" }}>{s.label}</p>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${s.accent}18`, color: s.accent }}>
                {s.icon}
              </div>
            </div>
            <p className="text-5xl font-black mb-1" style={{ color: "var(--text)" }}>{s.value}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Vehicles Incoming ────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 160, damping: 22 }}
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "#3b82f644", boxShadow: "var(--card-shadow)" }}>

        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe22)", borderColor: "#bfdbfe" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "#3b82f620" }}>
              <svg className="w-5 h-5" style={{ color: "#3b82f6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 8l-4 4m0 0l4 4m-4-4h18" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-base" style={{ color: "#1d4ed8" }}>Vehicles Incoming</h2>
              <p className="text-xs" style={{ color: "#3b82f6" }}>
                {user.defaultLocation
                  ? `Vehicles heading to ${user.defaultLocation} — create SUB IN to receive`
                  : "Vehicles en route — create SUB IN pass to receive them"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {incoming.length > 0 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background: "#3b82f620", color: "#1d4ed8" }}>
                {incoming.length} vehicle{incoming.length !== 1 ? "s" : ""}
              </span>
            )}
            <button onClick={() => void fetchIncoming()}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-70"
              style={{ background: "#dbeafe" }} title="Refresh">
              <svg className="w-3.5 h-3.5" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {incomingLoading ? (
            <div className="flex items-center gap-3 py-6 justify-center">
              <svg className="animate-spin w-5 h-5" style={{ color: "#3b82f6" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading incoming vehicles…</span>
            </div>
          ) : incoming.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-5 rounded-xl"
              style={{ background: "var(--surface2)" }}>
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>No vehicles incoming</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  When a SUB OUT is created and approved for{user.defaultLocation ? ` ${user.defaultLocation}` : " your location"}, vehicles will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {incoming.map((v, i) => (
                  <motion.div key={v.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-xl border overflow-hidden"
                    style={{
                      background: v.hasActiveSubIn ? "#f0fdf4" : "var(--surface2)",
                      borderColor: v.hasActiveSubIn ? "#bbf7d0" : "var(--border)",
                    }}>
                    {/* Status stripe at top — all incoming are COMPLETED (left HQ) */}
                    <div className="h-1 w-full"
                      style={{ background: "linear-gradient(90deg,#8b5cf6,#6366f1)" }} />

                    <div className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {/* Vehicle icon */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{
                            background: v.hasActiveSubIn ? "#dcfce7" : "#dbeafe",
                          }}>
                          <svg className="w-5 h-5" style={{ color: v.hasActiveSubIn ? "#15803d" : "#2563eb" }}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M13 8h4l3 3v5h-7V8z" />
                          </svg>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: GP number + vehicle name + type badges */}
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                              style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                              {v.gatePassNumber}
                            </span>
                            <span className="font-bold text-sm" style={{ color: "var(--text)" }}>
                              {v.vehicle}
                            </span>
                            {/* Status: all are COMPLETED (confirmed left HQ by gate officer) */}
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: "#ede9fe", color: "#7c3aed" }}>
                              🚗 In Transit
                            </span>
                          </div>

                          {/* Row 2: Chassis, Make, Color */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            {v.chassis && (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                                style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                                {v.chassis}
                              </span>
                            )}
                            {v.make && (
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{v.make}</span>
                            )}
                            {v.vehicleColor && (
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>· {v.vehicleColor}</span>
                            )}
                          </div>

                          {/* Row 3: From → To + meta */}
                          <div className="flex items-center gap-3 flex-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                            <div className="flex items-center gap-1 font-medium">
                              <span className="px-2 py-0.5 rounded-md"
                                style={{ background: "#fef3c7", color: "#92400e" }}>
                                {v.fromLocation || "—"}
                              </span>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
                              <span className="px-2 py-0.5 rounded-md font-bold"
                                style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                                {v.toLocation || "—"}
                              </span>
                            </div>
                            {(v.serviceJobNo || v.parentPass?.serviceJobNo) && (
                              <span className="font-mono font-bold px-2 py-0.5 rounded-md"
                                style={{ background: "#fef3c7", color: "#b45309" }}>
                                Job: {v.serviceJobNo ?? v.parentPass?.serviceJobNo}
                              </span>
                            )}
                            {v.requestedBy && (
                              <span>Requested by: <strong style={{ color: "var(--text)" }}>{v.requestedBy}</strong></span>
                            )}
                            {v.departureDate && (
                              <span>Departed: {fmtDate(v.departureDate)}</span>
                            )}
                            <span style={{ color: "var(--text-muted)" }}>Created by: {v.createdBy.name}</span>
                          </div>
                        </div>

                        {/* Action */}
                        <div className="flex-shrink-0 ml-2 flex flex-col gap-1.5">
                          {v.hasActiveSubIn ? (
                            <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                              style={{ background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd" }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                              Awaiting Security Gate IN
                            </span>
                          ) : (
                            <button
                              onClick={() => void handleCreateSubIn(v)}
                              disabled={actioningId === v.id}
                              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)" }}>
                              {actioningId === v.id
                                ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                              Create Sub IN Pass
                            </button>
                          )}
                          <Link href={`/gate-pass/${v.id}`}
                            className="text-center text-[11px] font-semibold px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                            style={{ background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── My Sub-Passes ────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32, type: "spring", stiffness: 160, damping: 22 }}
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>

        {/* Table header */}
        <div className="flex items-center justify-between px-5 py-4 border-b gap-4 flex-wrap"
          style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--lime)" }} />
            <h2 className="font-bold text-sm" style={{ color: "var(--text)" }}>My Sub-Passes</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              {myTotal} total
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sub-type filter */}
            <select
              value={subTypeFilter}
              onChange={e => setSubTypeFilter(e.target.value)}
              className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="ALL">All Types</option>
              <option value="SUB_OUT">Sub Out</option>
              <option value="SUB_IN">Sub In</option>
              <option value="SUB_OUT_IN">Sub OUT/IN</option>
              <option value="MAIN_OUT">Main Out</option>
            </select>
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="ALL">All Status</option>
              <option value="CASHIER_REVIEW">Cashier Review</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="GATE_OUT">Gate Out</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {/* Table */}
        {myLoading ? (
          <div className="flex items-center justify-center py-10 gap-3">
            <svg className="animate-spin w-5 h-5" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading passes…</span>
          </div>
        ) : myPasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg className="w-10 h-10" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>No passes found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    {["GP No", "Vehicle / Chassis", "Type", "Route", "Status", "Date"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: "var(--text-muted)", background: "var(--surface2)" }}>
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest"
                      style={{ color: "var(--text-muted)", background: "var(--surface2)" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {myPasses.map(p => (
                    <tr key={p.id} className="hover:opacity-80 transition-opacity">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold" style={{ color: "#1d4ed8" }}>
                          {p.gatePassNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sm leading-tight" style={{ color: "var(--text)" }}>
                          {p.vehicle}
                        </p>
                        {p.chassis && (
                          <p className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                            {p.chassis}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <SubTypeBadge type={p.passSubType} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                          <span className="max-w-[80px] truncate">{p.fromLocation || "—"}</span>
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                          <span className="max-w-[80px] truncate font-medium" style={{ color: "var(--text)" }}>
                            {p.toLocation || "—"}
                          </span>
                        </div>
                        {p.serviceJobNo && (
                          <span className="text-[11px] font-mono font-bold mt-1 inline-block px-1.5 py-0.5 rounded"
                            style={{ background: "#fef3c7", color: "#b45309" }}>
                            Job: {p.serviceJobNo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {fmtDate(p.departureDate ?? p.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {p.passSubType === "SUB_IN" && p.status === "APPROVED" && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                              style={{ background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd" }}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                              Awaiting Security Gate IN
                            </span>
                          )}
                          {p.passSubType === "SUB_IN" && p.status === "COMPLETED" && (
                            <>
                              <Link href={`/gate-pass/create-sub-out-in/${p.id}`}
                                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
                                style={{ background: "#ffedd5", color: "#c2410c", border: "1px solid #fdba74" }}
                                title="Return vehicle to DIMO HQ">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                                </svg>
                                Return to HQ
                              </Link>
                              <Link href={`/gate-pass/create-aso-main-out/${p.id}`}
                                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
                                style={{ background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd" }}
                                title="Direct customer delivery from this location">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                                Deliver
                              </Link>
                            </>
                          )}
                          {p.passSubType === "SUB_OUT_IN" && p.status === "APPROVED" && (
                            <button
                              onClick={() => void handlePassAction(p.id, "gate_out", "Confirm Gate Out — vehicle is leaving your location")}
                              disabled={actioningId === p.id}
                              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                              style={{ background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", opacity: actioningId === p.id ? 0.5 : 1 }}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
                              Gate Out
                            </button>
                          )}
                          <Link href={`/gate-pass/${p.id}`}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                            style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)" }}>
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {myPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Page {myPage} of {myPages}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setMyPage(p => Math.max(1, p - 1))} disabled={myPage === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40 hover:opacity-70 transition-opacity"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                    ← Prev
                  </button>
                  <button onClick={() => setMyPage(p => Math.min(myPages, p + 1))} disabled={myPage === myPages}
                    className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40 hover:opacity-70 transition-opacity"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
