"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";

type GatePass = {
  id: string; gatePassNumber: string; passType: string; status: string;
  vehicle: string; vehicleColor: string | null; chassis: string | null; make: string | null;
  toLocation: string | null; requestedBy: string | null;
  transportMode: string | null; companyName: string | null; carrierName: string | null;
  carrierRegNo: string | null; driverName: string | null; driverNIC: string | null;
  driverContact: string | null;
  createdBy: { name: string }; approvedBy: { name: string } | null;
  createdAt: string; departureDate: string | null; arrivalDate: string | null;
};

const colorDot: Record<string, string> = {
  Red: "#ef4444", White: "#d1d5db", Blue: "#3b82f6", Black: "#1f2937",
  Silver: "#94a3b8", "Dark Red": "#991b1b", Grey: "#6b7280",
};

function SlideToConfirm({ onConfirm, label = "Slide to Confirm Gate IN" }: { onConfirm: () => void; label?: string }) {
  const x = useMotionValue(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const TRACK_W = 280;
  const THUMB_W = 56;
  const MAX = TRACK_W - THUMB_W - 8;

  const bg = useTransform(x, [0, MAX], ["rgba(16,185,129,0.15)", "rgba(16,185,129,0.9)"]);
  const textOpacity = useTransform(x, [0, MAX * 0.5], [1, 0]);

  function handleDragEnd() {
    if (x.get() >= MAX * 0.85) {
      animate(x, MAX, { duration: 0.15 });
      setConfirmed(true);
      setLoading(true);
      setTimeout(() => onConfirm(), 400);
    } else {
      animate(x, 0, { type: "spring", stiffness: 300, damping: 25 });
    }
  }

  if (confirmed) {
    return (
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="flex items-center justify-center gap-2 h-14 rounded-full text-white font-bold text-sm"
        style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
      >
        {loading ? (
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
        Confirmed!
      </motion.div>
    );
  }

  return (
    <div ref={trackRef} className="relative h-14 rounded-full overflow-hidden select-none" style={{ width: TRACK_W, background: "rgba(16,185,129,0.12)", border: "1.5px solid rgba(16,185,129,0.3)" }}>
      <motion.div className="absolute inset-0 rounded-full" style={{ background: bg }} />
      <motion.div
        style={{ opacity: textOpacity, color: "#10b981" }}
        className="absolute inset-0 flex items-center justify-center text-sm font-semibold pointer-events-none"
      >
        {label}
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: MAX }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x, left: 4, top: 4, background: "linear-gradient(135deg,#10b981,#059669)" }}
        className="absolute w-12 h-12 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg z-10"
        whileTap={{ scale: 0.95 }}
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </motion.div>
    </div>
  );
}

function GatePassCard({ pass, onClick }: { pass: GatePass; onClick: () => void }) {
  const dot = colorDot[pass.vehicleColor || ""] || "#94a3b8";
  const isGateOut = pass.status === "GATE_OUT";
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-4 transition-all hover:shadow-md"
      style={{ background: "var(--surface)", borderColor: isGateOut ? "rgba(16,185,129,0.3)" : "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono font-bold text-xs" style={{ color: "var(--accent)" }}>{pass.gatePassNumber}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={isGateOut ? { background: "#f0fdf4", color: "#15803d" } : { background: "#f5f3ff", color: "#5b21b6" }}>
              {isGateOut ? "En Route" : "Received"}
            </span>
          </div>
          <p className="font-semibold text-sm mb-0.5" style={{ color: "var(--text)" }}>{pass.vehicle}</p>
          {pass.chassis && (
            <p className="font-mono text-xs mb-2" style={{ color: "var(--text-muted)" }}>{pass.chassis}</p>
          )}
          <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: "var(--text-muted)" }}>
            {pass.driverName && <span>Driver: <strong style={{ color: "var(--text)" }}>{pass.driverName}</strong></span>}
            {pass.companyName && <span>Co: <strong style={{ color: "var(--text)" }}>{pass.companyName}</strong></span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {pass.vehicleColor && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{pass.vehicleColor}</span>
              <div className="w-5 h-5 rounded-full shadow-sm border-2" style={{ background: dot, borderColor: "var(--border)" }} />
            </div>
          )}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text-muted)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      {isGateOut && (
        <div className="mt-3 pt-3 border-t flex items-center gap-1.5 text-xs font-medium" style={{ borderColor: "var(--border)", color: "#10b981" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Tap to confirm receipt
        </div>
      )}
    </motion.button>
  );
}

function DetailDrawer({ pass, onClose, onConfirm }: { pass: GatePass; onClose: () => void; onConfirm: () => void }) {
  const [mismatch, setMismatch] = useState(false);
  const [mismatchNote, setMismatchNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const dot = colorDot[pass.vehicleColor || ""] || "#94a3b8";
  const isGateOut = pass.status === "GATE_OUT";

  async function handleConfirm() {
    setConfirming(true);
    try {
      await fetch(`/api/gate-pass/${pass.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_in", mismatch, mismatchNote }),
      });
      setDone(true);
      setTimeout(() => { onClose(); onConfirm(); }, 1800);
    } catch {
      setConfirming(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border overflow-hidden max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <h3 className="text-xl font-bold mb-1" style={{ color: "var(--text)" }}>Vehicle Received!</h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Gate pass marked as Completed</p>
          </div>
        ) : (
          <>
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  {isGateOut ? "Gate IN" : "Completed"}
                </p>
                <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>{pass.gatePassNumber}</h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Vehicle banner */}
            <div className="mx-5 mt-4 rounded-2xl p-4" style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-base">{pass.vehicle}</p>
                  {pass.chassis && <p className="text-blue-200 font-mono text-xs mt-0.5">{pass.chassis}</p>}
                  {pass.make && <p className="text-blue-200 text-xs">{pass.make}</p>}
                </div>
                {pass.vehicleColor && (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 rounded-full shadow-lg border-2 border-white/30" style={{ background: dot }} />
                    <p className="text-blue-200 text-xs">{pass.vehicleColor}</p>
                  </div>
                )}
              </div>
            </div>

            {/* In Details */}
            <div className="px-5 mt-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>In Details</p>
              <div className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Initiator</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{pass.createdBy.name}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Purpose / Location</span>
                  <span className="text-sm font-semibold text-right" style={{ color: "var(--text)" }}>{pass.toLocation || pass.requestedBy || "-"}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Pass Type</span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                    {pass.passType === "LOCATION_TRANSFER" ? "Location Transfer" : "Customer Delivery"}
                  </span>
                </div>
              </div>
            </div>

            {/* Carrier Transportation */}
            <div className="px-5 mt-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Carrier Transportation</p>
              <div className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
                {[
                  ["Company Name",  pass.companyName],
                  ["Carrier Reg No", pass.carrierRegNo],
                  ["Driver Name",   pass.driverName],
                  ["Driver NIC No", pass.driverNIC],
                  ["Contact No",    pass.driverContact],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
                    <span className="text-sm font-semibold" style={{ color: value ? "var(--text)" : "var(--text-muted)" }}>{value || "-"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mismatch check */}
            {isGateOut && (
              <div className="px-5 mt-4">
                <button
                  onClick={() => setMismatch((v) => !v)}
                  className="flex items-center gap-3 w-full rounded-xl border px-4 py-3 text-left transition-all"
                  style={{
                    borderColor: mismatch ? "#fca5a5" : "var(--border)",
                    background: mismatch ? "#fef2f2" : "var(--surface2)",
                  }}
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all"
                    style={{ borderColor: mismatch ? "#ef4444" : "var(--border)", background: mismatch ? "#ef4444" : "transparent" }}>
                    {mismatch && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm font-medium" style={{ color: mismatch ? "#991b1b" : "var(--text)" }}>
                    Mismatch with the details
                  </span>
                </button>
                <AnimatePresence>
                  {mismatch && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <textarea
                        value={mismatchNote}
                        onChange={(e) => setMismatchNote(e.target.value)}
                        placeholder="Describe the mismatch..."
                        rows={2}
                        className="w-full mt-2 border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                        style={{ background: "var(--surface)", borderColor: "#fca5a5", color: "var(--text)" }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Slide to confirm */}
            <div className="px-5 pt-4 pb-6 flex justify-center">
              {isGateOut ? (
                <SlideToConfirm onConfirm={handleConfirm} />
              ) : (
                <div className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold" style={{ background: "#f0fdf4", color: "#15803d" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Vehicle Already Received
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

interface Props {
  user: { name?: string | null; email?: string | null; role: string | null };
}

export default function RecipientDashboardClient({ user }: Props) {
  const [tab, setTab] = useState<"in" | "out">("in");
  const [search, setSearch] = useState("");
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GatePass | null>(null);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const d = await res.json();
        setPasses(d.passes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);

  const gateInList = passes.filter((p) => p.status === "GATE_OUT");
  const gateOutList = passes.filter((p) => p.status === "COMPLETED");
  const displayed = tab === "in" ? gateInList : gateOutList;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--lime)" }}>Recipient</p>
          <h1 className="text-3xl font-bold title-font leading-tight gradient-text">
            Welcome, {user.name?.split(" ")[0]}
          </h1>
          {gateInList.length > 0 && (
            <p className="text-sm mt-0.5 font-medium" style={{ color: "#10b981" }}>
              {gateInList.length} vehicle{gateInList.length > 1 ? "s" : ""} en route to you
            </p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by chassis, GP number, vehicle..."
          className="w-full border rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text-muted)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 mb-5">
        <button
          onClick={() => setTab("in")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all"
          style={tab === "in"
            ? { background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", borderColor: "transparent", boxShadow: "0 4px 14px rgba(16,185,129,0.35)" }
            : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          Gate IN
          <span className="ml-0.5 px-2 py-0.5 rounded-full text-xs font-bold" style={tab === "in" ? { background: "rgba(255,255,255,0.25)" } : { background: "var(--surface2)", color: "#10b981" }}>
            {gateInList.length}
          </span>
        </button>
        <button
          onClick={() => setTab("out")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all"
          style={tab === "out"
            ? { background: "linear-gradient(135deg,#5b21b6,#7c3aed)", color: "#fff", borderColor: "transparent", boxShadow: "0 4px 14px rgba(91,33,182,0.35)" }
            : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          Gate OUT
          <span className="ml-0.5 px-2 py-0.5 rounded-full text-xs font-bold" style={tab === "out" ? { background: "rgba(255,255,255,0.25)" } : { background: "var(--surface2)", color: "#5b21b6" }}>
            {gateOutList.length}
          </span>
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
          ))
        ) : displayed.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3" style={{ background: "var(--surface)" }}>
              {tab === "in" ? "🚗" : "✅"}
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              {tab === "in" ? "No vehicles en route" : "No completed deliveries yet"}
            </p>
          </motion.div>
        ) : (
          displayed.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <GatePassCard pass={p} onClick={() => setSelected(p)} />
            </motion.div>
          ))
        )}
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <DetailDrawer
            pass={selected}
            onClose={() => setSelected(null)}
            onConfirm={() => { setSelected(null); fetchPasses(); }}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
