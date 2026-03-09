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
  Red: "#ef4444", "Dark Red": "#991b1b", Maroon: "#800000", Crimson: "#dc143c",
  White: "#f3f4f6", "Off White": "#fafaf9", Ivory: "#fffff0",
  Blue: "#3b82f6", "Dark Blue": "#1d4ed8", Navy: "#001f5b", "Sky Blue": "#0ea5e9",
  Black: "#111827",
  Silver: "#c0c0c0", Grey: "#6b7280", Gray: "#6b7280",
  Green: "#16a34a", "Dark Green": "#14532d", Olive: "#6b7a00",
  Yellow: "#fbbf24", Gold: "#d97706",
  Orange: "#f97316",
  Brown: "#92400e", Beige: "#e5d5b8",
  Purple: "#7c3aed", Violet: "#7c3aed",
};

function resolveColor(colorName: string | null): string {
  if (!colorName) return "#94a3b8";
  // Exact match first
  if (colorDot[colorName]) return colorDot[colorName];
  // Title-case match (e.g. "black" → "Black")
  const title = colorName.charAt(0).toUpperCase() + colorName.slice(1).toLowerCase();
  if (colorDot[title]) return colorDot[title];
  // Fall back to CSS named color (works for "black", "red", "blue", etc.)
  return colorName.toLowerCase();
}

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
  const dot = resolveColor(pass.vehicleColor);
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
  const [done, setDone] = useState(false);
  const dot = resolveColor(pass.vehicleColor);
  const isGateOut = pass.status === "GATE_OUT";

  async function handleConfirm() {
    try {
      await fetch(`/api/gate-pass/${pass.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_in", mismatch, mismatchNote }),
      });
      setDone(true);
      setTimeout(() => { onClose(); onConfirm(); }, 1800);
    } catch {
      // ignore
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

type TabKey = "lt_in" | "lt_out" | "cd_out" | "sr_out";

const TABS: { key: TabKey; label: string; passType: string; status: string | null }[] = [
  { key: "lt_in",  label: "Location Transfer IN",  passType: "LOCATION_TRANSFER", status: "GATE_OUT"   },
  { key: "lt_out", label: "Location Transfer OUT",  passType: "LOCATION_TRANSFER", status: "COMPLETED"  },
  { key: "cd_out", label: "Customer Delivery",      passType: "CUSTOMER_DELIVERY", status: null         },
  { key: "sr_out", label: "Service/Repair",         passType: "AFTER_SALES",       status: null         },
];

const TAB_COLORS: Record<TabKey, { gradient: string; shadow: string; badge: string }> = {
  lt_in:  { gradient: "linear-gradient(135deg,#10b981,#059669)", shadow: "rgba(16,185,129,0.35)",  badge: "#10b981" },
  lt_out: { gradient: "linear-gradient(135deg,#1a4f9e,#2563eb)", shadow: "rgba(37,99,235,0.35)",   badge: "#2563eb" },
  cd_out: { gradient: "linear-gradient(135deg,#5b21b6,#7c3aed)", shadow: "rgba(124,58,237,0.35)", badge: "#7c3aed" },
  sr_out: { gradient: "linear-gradient(135deg,#d97706,#b45309)", shadow: "rgba(217,119,6,0.35)",   badge: "#d97706" },
};

export default function RecipientDashboardClient({ user }: Props) {
  const [tab, setTab] = useState<TabKey>("lt_in");
  const [search, setSearch] = useState("");
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GatePass | null>(null);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
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

  const pendingCount = passes.filter(p => p.status === "GATE_OUT").length;

  const displayed = passes.filter(p => {
    const t = TABS.find(x => x.key === tab)!;
    if (p.passType !== t.passType) return false;
    if (t.status) return p.status === t.status;
    return true; // CD_OUT: show all statuses
  });

  const countFor = (key: TabKey) => {
    const t = TABS.find(x => x.key === key)!;
    return passes.filter(p => p.passType === t.passType && (t.status ? p.status === t.status : true)).length;
  };

  const colors = TAB_COLORS[tab];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--lime)" }}>Recipient</p>
        <h1 className="text-3xl font-bold title-font leading-tight gradient-text">
          Welcome, {user.name?.split(" ")[0]}
        </h1>
        {pendingCount > 0 && (
          <p className="text-sm mt-0.5 font-medium" style={{ color: "#10b981" }}>
            {pendingCount} vehicle{pendingCount > 1 ? "s" : ""} en route to you
          </p>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-5">
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

      {/* Sliding 3-tab segmented control */}
      <div
        className="relative flex rounded-2xl p-1 mb-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* Sliding pill */}
        <motion.div
          layout
          layoutId="tab-pill"
          className="absolute top-1 bottom-1 rounded-xl"
          style={{
            background: colors.gradient,
            boxShadow: `0 4px 14px ${colors.shadow}`,
            width: `calc(${100/4}% - 4px)`,
            left: `calc(${TABS.findIndex(t => t.key === tab)} * ${100/4}% + 2px)`,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
        {TABS.map((t) => {
          const isActive = tab === t.key;
          const cnt = countFor(t.key);
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-semibold transition-colors z-10"
              style={{ color: isActive ? "#fff" : "var(--text-muted)" }}
            >
              <span className="truncate">{t.label}</span>
              {cnt > 0 && (
                <span
                  className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.25)" : "var(--surface2)",
                    color: isActive ? "#fff" : TAB_COLORS[t.key].badge,
                  }}
                >
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.18 }}
          className="space-y-3"
        >
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
            ))
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3" style={{ background: "var(--surface)" }}>
                {tab === "lt_in" ? "🚗" : tab === "lt_out" ? "📦" : tab === "cd_out" ? "🚚" : "🔧"}
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                {tab === "lt_in" ? "No vehicles en route" : tab === "lt_out" ? "No completed transfers" : tab === "cd_out" ? "No customer deliveries yet" : "No service/repair requests yet"}
              </p>
            </div>
          ) : (
            displayed.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <GatePassCard pass={p} onClick={() => setSelected(p)} />
              </motion.div>
            ))
          )}
        </motion.div>
      </AnimatePresence>

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
