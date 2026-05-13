"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

type GatePass = {
  id: string;
  gatePassNumber: string;
  passType: string;
  passSubType: string | null;
  status: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  vehicleColor: string | null;
  toLocation: string | null;
  fromLocation: string | null;
  outReason: string | null;
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  transportMode: string | null;
  driverName: string | null;
  companyName: string | null;
  comments: string | null;
  createdBy: { name: string };
  approvedBy: { name: string } | null;
  createdAt: string;
  parentPass?: { gatePassNumber: string } | null;
};

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function PassTypeBadge({ passType, passSubType }: { passType: string; passSubType: string | null }) {
  if (passType === "AFTER_SALES" && passSubType === "SUB_OUT") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{ background: "#ede9fe", color: "#6d28d9" }}>
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0l-7-7m7 7l-7 7" />
        </svg>
        After Sales — Sub Gate OUT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: "#d1fae5", color: "#065f46" }}>
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
      </svg>
      Location Transfer
    </span>
  );
}

export default function ReceivePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [ltPending, setLtPending] = useState<GatePass[]>([]);
  const [asPending, setAsPending] = useState<GatePass[]>([]);
  const [completed, setCompleted] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedChassis, setUpdatedChassis] = useState<Record<string, string>>({});
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");

  useEffect(() => {
    const allowedRoles = ["RECIPIENT", "INITIATOR", "SERVICE_ADVISOR"];
    if (status === "authenticated" && !allowedRoles.includes(session?.user?.role ?? "")) {
      router.replace("/");
    }
  }, [status, session, router]);

  const myLocation = (session?.user as { defaultLocation?: string | null })?.defaultLocation ?? null;

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const ltParams = new URLSearchParams({ passType: "LOCATION_TRANSFER", status: "GATE_OUT", limit: "50" });
      // Only show GATE_OUT SUB_OUT — vehicle must have physically left source (source SO confirmed Gate OUT)
      const asGateOutParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", status: "GATE_OUT", limit: "50" });
      const ltCompParams = new URLSearchParams({ passType: "LOCATION_TRANSFER", status: "COMPLETED", limit: "20" });
      const asCompParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", status: "COMPLETED", limit: "20" });
      if (myLocation) {
        ltParams.set("toLocation", myLocation);
        asGateOutParams.set("toLocation", myLocation);
        ltCompParams.set("toLocation", myLocation);
        asCompParams.set("toLocation", myLocation);
      }

      // Sequential fetches — connection pool limit is 1 on Supabase free tier
      const ltRes       = await fetch(`/api/gate-pass?${ltParams}`);
      const ltData      = ltRes.ok ? await ltRes.json() : { passes: [] };
      const asGateOutRes  = await fetch(`/api/gate-pass?${asGateOutParams}`);
      const asGateOutData = asGateOutRes.ok ? await asGateOutRes.json() : { passes: [] };
      const ltCompRes   = await fetch(`/api/gate-pass?${ltCompParams}`);
      const ltCompData  = ltCompRes.ok ? await ltCompRes.json() : { passes: [] };
      const asCompRes   = await fetch(`/api/gate-pass?${asCompParams}`);
      const asCompData  = asCompRes.ok ? await asCompRes.json() : { passes: [] };

      const locationMatch = (p: GatePass) => !myLocation || !p.toLocation || p.toLocation === myLocation;
      setLtPending((ltData.passes ?? []).filter(locationMatch));
      setAsPending((asGateOutData.passes ?? []).filter(locationMatch));
      setCompleted([
        ...(asCompData.passes ?? []).filter(locationMatch),
        ...(ltCompData.passes ?? []).filter(locationMatch),
      ]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation]);

  useEffect(() => {
    if (status === "authenticated") void fetchPasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Notification poll: auto-refresh when vehicle arrives or security confirms Gate IN
  const lastNotifCount = useRef(0);
  useEffect(() => {
    if (status !== "authenticated") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        const count = (data.notifications ?? []).filter(
          (n: { type: string; read: boolean }) => n.type === "GATE_PASS_RECEIVED" && !n.read
        ).length;
        if (count > lastNotifCount.current) {
          lastNotifCount.current = count;
          void fetchPasses();
        } else {
          lastNotifCount.current = count;
        }
      } catch { /* ignore */ }
    }, 10_000);
    return () => clearInterval(poll);
  }, [status, fetchPasses]);

  if (status === "loading") return null;

  const totalPending = ltPending.length + asPending.length;

  const handleAcknowledge = async (id: string) => {
    setAcknowledging(id);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gate_in",
          receivedChassis: updatedChassis[id] || undefined,
        }),
      });
      if (res.ok) {
        const movedLt = ltPending.find(p => p.id === id);
        const movedAs = asPending.find(p => p.id === id);
        const moved = movedLt || movedAs;
        if (movedLt) setLtPending(prev => prev.filter(p => p.id !== id));
        if (movedAs) setAsPending(prev => prev.filter(p => p.id !== id));
        if (moved) setCompleted(prev => [{ ...moved, status: "COMPLETED" }, ...prev]);
        setUpdatedChassis(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    } finally {
      setAcknowledging(null);
    }
  };

  const allPending = [...asPending, ...ltPending]; // After Sales first

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1" style={{ color: "#B5CC18" }}>
            Vehicle Arrivals
          </p>
          <h1 className="text-3xl font-bold leading-tight" style={{ color: "var(--text)" }}>
            Incoming Vehicles
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Confirm arrivals — After Sales transfers &amp; Location Transfer passes
          </p>
        </div>
        <button
          onClick={() => void fetchPasses()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Pending Arrival", value: totalPending, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
          { label: "After Sales", value: asPending.length, color: "#7c3aed", bg: "rgba(124,58,237,0.1)", icon: "M19 11H5m14 0l-7-7m7 7l-7 7" },
          { label: "Location Transfer", value: ltPending.length, color: "#059669", bg: "rgba(5,150,105,0.1)", icon: "M7 8l-4 4m0 0l4 4m-4-4h18" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border p-4"
            style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <svg className="w-4 h-4" style={{ color: s.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-black" style={{ color: "var(--text)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: "var(--surface2)" }}>
        {[
          { key: "pending", label: "Pending Arrivals", count: totalPending },
          { key: "completed", label: "Recently Confirmed", count: completed.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as "pending" | "completed")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: activeTab === t.key ? "var(--surface)" : "transparent",
              color: activeTab === t.key ? "var(--text)" : "var(--text-muted)",
              boxShadow: activeTab === t.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: activeTab === t.key ? "#B5CC18" : "var(--border)", color: activeTab === t.key ? "#0F1A3E" : "var(--text-muted)" }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "pending" ? (
          <motion.div key="pending" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map(i => (
                  <div key={i} className="rounded-2xl border p-5 animate-pulse" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <div className="h-5 rounded w-32 mb-3" style={{ background: "var(--border)" }} />
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 2, 3].map(j => <div key={j} className="h-4 rounded" style={{ background: "var(--border)" }} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : allPending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--surface2)" }}>
                  <svg className="w-8 h-8" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-base mb-1" style={{ color: "var(--text)" }}>No pending arrivals</p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>All clear — no vehicles awaiting confirmation</p>
              </div>
            ) : (
              <div className="space-y-4">
                {allPending.map((gp, i) => {
                  const isAS = gp.passType === "AFTER_SALES";
                  const accentColor = isAS ? "#7c3aed" : "#059669";
                  const accentBg = isAS ? "#ede9fe" : "#d1fae5";
                  return (
                    <motion.div
                      key={gp.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-2xl border overflow-hidden"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}
                    >
                      {/* Accent top bar */}
                      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44)` }} />

                      <div className="p-5">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: accentBg }}>
                              <svg className="w-5 h-5" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isAS
                                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0l-7-7m7 7l-7 7" />
                                  : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8l-4 4m0 0l4 4m-4-4h18" /></>
                                }
                              </svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-base font-mono" style={{ color: "var(--accent)" }}>
                                  {gp.parentPass?.gatePassNumber ?? gp.gatePassNumber}
                                </span>
                                <PassTypeBadge passType={gp.passType} passSubType={gp.passSubType} />
                                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                  style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}>
                                  Gate Out — Awaiting Security Gate IN
                                </span>
                              </div>
                              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                                By {gp.createdBy.name} · {timeAgo(gp.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Vehicle + details grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl p-4 mb-4"
                          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Vehicle</p>
                            <p className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{gp.vehicle}</p>
                          </div>
                          {gp.chassis && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Chassis No</p>
                              <p className="text-xs font-mono font-semibold" style={{ color: "var(--text)" }}>{gp.chassis}</p>
                            </div>
                          )}
                          {gp.make && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Make</p>
                              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.make}</p>
                            </div>
                          )}
                          {gp.vehicleColor && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Color</p>
                              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.vehicleColor}</p>
                            </div>
                          )}
                          {(gp.departureDate || gp.departureTime) && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Departed</p>
                              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.departureDate} {gp.departureTime}</p>
                            </div>
                          )}
                          {(gp.arrivalDate || gp.arrivalTime) && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Expected Arrival</p>
                              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.arrivalDate || "—"} {gp.arrivalTime || ""}</p>
                            </div>
                          )}
                          {(gp.transportMode || gp.companyName || gp.driverName) && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Transport</p>
                              <p className="text-xs font-medium" style={{ color: "var(--text)" }}>
                                {[gp.transportMode, gp.companyName, gp.driverName].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                          )}
                          {gp.approvedBy && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Approved By</p>
                              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.approvedBy.name}</p>
                            </div>
                          )}
                        </div>

                        {/* Route */}
                        {(gp.fromLocation || gp.toLocation) && (
                          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-4"
                            style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}22` }}>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{gp.fromLocation || "—"}</span>
                            <svg className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            <span className="text-xs font-bold" style={{ color: accentColor }}>{gp.toLocation || "—"}</span>
                            {isAS && (
                              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: "#fef9c3", color: "#854d0e" }}>
                                Security Gate IN also required
                              </span>
                            )}
                          </div>
                        )}

                        {/* Chassis update + Confirm button */}
                        {isAS ? (
                          /* AFTER_SALES SUB_OUT: Security Officer confirms Gate IN — initiator waits */
                          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                            style={{ background: "rgba(124,58,237,0.06)", border: "1.5px solid rgba(124,58,237,0.18)" }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: "rgba(124,58,237,0.12)" }}>
                              <svg className="w-4 h-4" style={{ color: "#7c3aed" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: "#7c3aed" }}>Awaiting Security Gate IN</p>
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>The Security Officer at this location will confirm vehicle arrival. This page will auto-update.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[220px]">
                              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                                Update Chassis
                                <span className="ml-1 font-normal">(if different from {gp.chassis || "—"})</span>
                              </label>
                              <input
                                type="text"
                                value={updatedChassis[gp.id] || ""}
                                onChange={(e) => setUpdatedChassis(prev => ({ ...prev, [gp.id]: e.target.value }))}
                                placeholder={gp.chassis || "Enter chassis number"}
                                className="w-full border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2"
                                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                              />
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                              onClick={() => handleAcknowledge(gp.id)}
                              disabled={acknowledging === gp.id}
                              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-70 whitespace-nowrap"
                              style={{ background: `linear-gradient(135deg, ${accentColor}dd, ${accentColor})` }}
                            >
                              {acknowledging === gp.id ? (
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {acknowledging === gp.id ? "Confirming…" : "Confirm Arrived"}
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="completed" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
            {completed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No recently confirmed arrivals</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completed.map((gp) => (
                  <div key={gp.id}
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl border"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "#d1fae5" }}>
                      <svg className="w-5 h-5" style={{ color: "#059669" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm font-mono" style={{ color: "var(--accent)" }}>
                          {gp.parentPass?.gatePassNumber ?? gp.gatePassNumber}
                        </span>
                        <PassTypeBadge passType={gp.passType} passSubType={gp.passSubType} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {gp.vehicle} {gp.chassis ? `· ${gp.chassis}` : ""}
                        {gp.fromLocation ? ` · ${gp.fromLocation} → ${gp.toLocation}` : ""}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ background: "#d1fae5", color: "#065f46" }}>
                      Security Gate IN ✓
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
