"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

type GatePass = {
  id: string; gatePassNumber: string; passType: string; passSubType: string | null; status: string;
  vehicle: string; chassis: string | null; departureDate: string | null; departureTime: string | null;
  requestedBy: string | null; toLocation: string | null; fromLocation: string | null; vehicleDetails: string | null;
  make: string | null; vehicleColor: string | null;
  createdBy: { name: string }; createdAt: string;
  parentPass: { id: string; gatePassNumber: string; passSubType: string | null } | null;
};

function collapseJourneyRows(items: GatePass[]) {
  const statusRank: Record<string, number> = {
    PENDING_APPROVAL: 8,
    CASHIER_REVIEW: 7,
    APPROVED: 6,
    INITIATOR_OUT: 5,
    INITIATOR_IN: 5,
    GATE_OUT: 4,
    COMPLETED: 3,
    REJECTED: 2,
    CANCELLED: 1,
  };

  const grouped = new Map<string, GatePass>();
  for (const pass of items) {
    if (pass.passType !== "AFTER_SALES") {
      grouped.set(`id:${pass.id}`, pass);
      continue;
    }

    const key = `journey:${pass.gatePassNumber}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, pass);
      continue;
    }

    const existingRank = statusRank[existing.status] ?? 0;
    const passRank = statusRank[pass.status] ?? 0;
    const existingTs = new Date(existing.departureDate || existing.createdAt).getTime();
    const passTs = new Date(pass.departureDate || pass.createdAt).getTime();

    if (passRank > existingRank || (passRank === existingRank && passTs > existingTs)) {
      grouped.set(key, pass);
    }
  }

  return Array.from(grouped.values());
}

type Stats = { pending: number; cashierReview: number; approved: number; rejected: number; gateOut: number; completed: number; cancelled: number; total: number };

interface Props {
  user: { name?: string | null; email?: string | null; role: string | null; defaultLocation?: string | null };
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

type IncomingVehicle = {
  id: string; gatePassNumber: string; vehicle: string; chassis: string | null;
  status: string;
  make: string | null; vehicleColor: string | null;
  fromLocation: string | null; toLocation: string | null; departureDate: string | null;
  requestedBy: string | null;
  serviceJobNo: string | null;
  createdBy: { name: string };
  parentPass: { id: string; gatePassNumber: string; serviceJobNo: string | null } | null;
  hasActiveSubIn?: boolean; // set client-side: SUB_IN created but not yet received
};

// ── Sub IN Quick Modal (ASO only) ──────────────────────────────────────────────

function SubInModal({ vehicle, onClose, onDone }: {
  vehicle: IncomingVehicle;
  onClose: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const time = now.toTimeString().slice(0, 5);
    try {
      const res = await fetch("/api/gate-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passType: "AFTER_SALES",
          passSubType: "SUB_IN",
          parentPassId: vehicle.parentPass?.id || null,
          vehicle: vehicle.vehicle,
          chassis: vehicle.chassis,
          fromLocation: vehicle.fromLocation,
          toLocation: vehicle.toLocation,
          departureDate: today,
          departureTime: time,
          comments: comment.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to create"); return; }
      setCreatedId(d.gatePass?.id ?? d.id ?? null);
    } finally {
      setCreating(false);
    }
  }

  async function handleMarkIn() {
    if (!createdId) return;
    setMarking(true);
    setError(null);
    try {
      const res = await fetch(`/api/gate-pass/${createdId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_out" }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); return; }
      onDone();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <motion.div
        className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "90vh" }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.16 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f0fdf4" }}>
              <svg className="w-4 h-4" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
              </svg>
            </div>
            <h2 className="font-bold text-sm" style={{ color: "var(--text)" }}>Create Sub IN Pass</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70"
            style={{ background: "var(--surface2)" }}>
            <svg className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Vehicle card — all details, read-only */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#bfdbfe" }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "#dbeafe" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#1d4ed8" }}>Vehicle Details</p>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                {vehicle.gatePassNumber}
              </span>
            </div>
            <div className="px-4 py-3" style={{ background: "#f0f9ff" }}>
              {/* Vehicle name + chassis */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#dbeafe" }}>
                  <svg className="w-4 h-4" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 8h4l3 3v5h-7V8z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{vehicle.vehicle}</p>
                  {vehicle.chassis && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{vehicle.chassis}</p>}
                </div>
              </div>
              {/* Grid of detail fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {vehicle.make && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>Make</p>
                    <p className="font-medium" style={{ color: "var(--text)" }}>{vehicle.make}</p>
                  </div>
                )}
                {vehicle.vehicleColor && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>Color</p>
                    <p className="font-medium" style={{ color: "var(--text)" }}>{vehicle.vehicleColor}</p>
                  </div>
                )}
                {(vehicle.serviceJobNo || vehicle.parentPass?.serviceJobNo) && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>Service Job No</p>
                    <p className="font-mono font-bold" style={{ color: "#b45309" }}>{vehicle.serviceJobNo ?? vehicle.parentPass?.serviceJobNo}</p>
                  </div>
                )}
                {vehicle.requestedBy && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>Requested By</p>
                    <p className="font-medium" style={{ color: "var(--text)" }}>{vehicle.requestedBy}</p>
                  </div>
                )}
                <div>
                  <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>From</p>
                  <p className="font-medium" style={{ color: "var(--text)" }}>{vehicle.fromLocation || "—"}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>To (Arriving)</p>
                  <p className="font-bold" style={{ color: "#2563eb" }}>{vehicle.toLocation || "—"}</p>
                </div>
                {vehicle.departureDate && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>Departure Date</p>
                    <p className="font-medium" style={{ color: "var(--text)" }}>{vehicle.departureDate}</p>
                  </div>
                )}
                <div>
                  <p className="font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>Created By</p>
                  <p className="font-medium" style={{ color: "var(--text)" }}>{vehicle.createdBy.name}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Comment box — only shown before creation */}
          {!createdId && (
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                Comment <span className="font-normal opacity-60">(optional)</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Any notes about vehicle condition, arrival details..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>
          )}

          {error && <p className="text-sm font-medium" style={{ color: "#ef4444" }}>{error}</p>}

          {/* Step 1: Create button */}
          {!createdId && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#065f46,#059669)" }}
            >
              {creating ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Creating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Sub IN
                </>
              )}
            </button>
          )}

          {/* Step 2: Mark as IN / Cancel */}
          {createdId && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-semibold" style={{ color: "#15803d" }}>Sub IN pass created! Mark vehicle as arrived?</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onClose}
                  className="py-2.5 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkIn}
                  disabled={marking}
                  className="py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 hover:opacity-90 transition-all"
                  style={{ background: "linear-gradient(135deg,#065f46,#22c55e)" }}
                >
                  {marking ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Marking…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
                      </svg>
                      Mark as IN
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function InitiatorDashboardClient({ user }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  // Prefer live session role; fall back to server-rendered prop (guaranteed correct on first render)
  const liveRole = (session?.user?.role ?? user.role ?? "").trim();
  const isASO = liveRole === "AREA_SALES_OFFICER" || (user.role ?? "").trim() === "AREA_SALES_OFFICER";

  const [passes, setPasses] = useState<GatePass[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, cashierReview: 0, approved: 0, rejected: 0, gateOut: 0, completed: 0, cancelled: 0, total: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [markingOutId, setMarkingOutId] = useState<string | null>(null);

  // Security-created DRAFT passes needing completion
  const [draftPasses, setDraftPasses] = useState<GatePass[]>([]);

  // ASO only: vehicles en route (SUB_OUT at GATE_OUT)
  const [incoming, setIncoming] = useState<IncomingVehicle[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [subInModal, setSubInModal] = useState<IncomingVehicle | null>(null);

  // INITIATOR only: SUB_IN passes created by ASO heading to initiator's location
  const [arrivingVehicles, setArrivingVehicles] = useState<GatePass[]>([]);
  const [arrivingLoading, setArrivingLoading] = useState(false);
  const [confirmingArrivedId, setConfirmingArrivedId] = useState<string | null>(null);
  const [newArrivalToast, setNewArrivalToast] = useState<string | null>(null);
  const [hasNewArrivals, setHasNewArrivals] = useState(false);
  const prevArrivingCount = useRef(0);

  // INITIATOR only: MAIN_IN passes at GATE_OUT = vehicle received at HQ, ready for action
  const [mainInActive, setMainInActive] = useState<GatePass[]>([]);
  const [mainInLoading, setMainInLoading] = useState(false);

  // ── Single coordinated initial load (replaces 5 separate simultaneous fetches) ──
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      if (isASO) {
        // ASO: fetch incoming vehicles (2 calls) + stats + drafts sequentially
        setIncomingLoading(true);
        try {
          const outParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", locationView: "true", limit: "50" });
          if (user.defaultLocation) outParams.set("toLocation", user.defaultLocation);
          const outRes = await fetch(`/api/gate-pass?${outParams}`);
          if (!cancelled && outRes.ok) {
            const outData = await outRes.json();
            const subOutPasses: IncomingVehicle[] = (outData.passes || []).filter(
              (p: IncomingVehicle) => p.status === "APPROVED" || p.status === "GATE_OUT"
            );
            const inParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_IN", locationView: "true", limit: "100" });
            const inRes = await fetch(`/api/gate-pass?${inParams}`);
            const subInStatusByParent = new Map<string, string>();
            if (inRes.ok) {
              const inData = await inRes.json();
              (inData.passes || []).forEach((p: { parentPass: { id: string } | null; status: string }) => {
                if (p.parentPass?.id && p.status !== "COMPLETED") subInStatusByParent.set(p.parentPass.id, p.status);
              });
            }
            if (!cancelled) setIncoming(
              subOutPasses
                .filter((p) => { const s = p.parentPass?.id ? subInStatusByParent.get(p.parentPass.id) : undefined; return s !== "GATE_OUT"; })
                .map((p) => ({ ...p, hasActiveSubIn: p.parentPass?.id ? subInStatusByParent.has(p.parentPass.id) : false }))
            );
          }
        } finally { if (!cancelled) setIncomingLoading(false); }
      } else {
        // INITIATOR: fetch main-in + arriving vehicles sequentially
        setMainInLoading(true);
        setArrivingLoading(true);
        try {
          const mainInParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "MAIN_IN", status: "GATE_OUT", limit: "50" });
          const mainInRes = await fetch(`/api/gate-pass?${mainInParams}`);
          if (!cancelled && mainInRes.ok) { const d = await mainInRes.json(); setMainInActive(d.passes || []); }
        } finally { if (!cancelled) setMainInLoading(false); }

        try {
          const subOutParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", status: "GATE_OUT", limit: "50" });
          if (user.defaultLocation) subOutParams.set("toLocation", user.defaultLocation);
          const [arrivingRes, subOutRes] = await Promise.all([
            fetch("/api/gate-pass?passType=AFTER_SALES&limit=100"),
            fetch(`/api/gate-pass?${subOutParams}`),
          ]);
          if (!cancelled && arrivingRes.ok) {
            const d = await arrivingRes.json();
            const subOutData = subOutRes.ok ? await subOutRes.json() : { passes: [] };
            const own = (d.passes || []).filter((p: GatePass) =>
              (p.passSubType === "SUB_OUT_IN" && (p.status === "APPROVED" || p.status === "GATE_OUT"))
              || (p.passSubType === "SUB_IN" && p.status === "GATE_OUT")
            );
            // Only show SUB_OUT passes heading TO this initiator's location (not leaving it)
            const incoming = (subOutData.passes || []).filter((p: GatePass) =>
              p.passSubType === "SUB_OUT" && p.status === "GATE_OUT"
              && (!user.defaultLocation || p.toLocation === user.defaultLocation)
            );
            const seen = new Set<string>();
            const merged: GatePass[] = [];
            for (const p of [...own, ...incoming]) {
              if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
            }
            setArrivingVehicles(merged);
          }
        } finally { if (!cancelled) setArrivingLoading(false); }
      }

      // Stats + drafts after role-specific data
      const [statsRes, draftRes] = await Promise.all([
        fetch("/api/gate-pass/stats"),
        fetch("/api/gate-pass?status=DRAFT&limit=20"),
      ]);
      if (!cancelled) {
        if (statsRes.ok) { const d = await statsRes.json(); setStats(d); }
        setStatsLoading(false);
        if (draftRes.ok) { const d = await draftRes.json(); setDraftPasses(d.passes ?? []); }
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isASO, user.defaultLocation]);

  // Individual refresh functions used by refresh buttons and action handlers
  const fetchIncoming = useCallback(async () => {
    if (!isASO) return;
    setIncomingLoading(true);
    try {
      const outParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", locationView: "true", limit: "50" });
      if (user.defaultLocation) outParams.set("toLocation", user.defaultLocation);
      const outRes = await fetch(`/api/gate-pass?${outParams}`);
      if (!outRes.ok) return;
      const outData = await outRes.json();
      const subOutPasses: IncomingVehicle[] = (outData.passes || []).filter((p: IncomingVehicle) => p.status === "APPROVED" || p.status === "GATE_OUT");
      const inParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_IN", locationView: "true", limit: "100" });
      const inRes = await fetch(`/api/gate-pass?${inParams}`);
      const subInStatusByParent = new Map<string, string>();
      if (inRes.ok) {
        const inData = await inRes.json();
        (inData.passes || []).forEach((p: { parentPass: { id: string } | null; status: string }) => {
          if (p.parentPass?.id && p.status !== "COMPLETED") subInStatusByParent.set(p.parentPass.id, p.status);
        });
      }
      setIncoming(
        subOutPasses
          .filter((p) => { const s = p.parentPass?.id ? subInStatusByParent.get(p.parentPass.id) : undefined; return s !== "GATE_OUT"; })
          .map((p) => ({ ...p, hasActiveSubIn: p.parentPass?.id ? subInStatusByParent.has(p.parentPass.id) : false }))
      );
    } finally { setIncomingLoading(false); }
  }, [isASO, user.defaultLocation]);

  const fetchArrivingVehicles = useCallback(async () => {
    if (isASO) return;
    setArrivingLoading(true);
    try {
      // Own passes (SUB_OUT_IN, SUB_IN) + incoming SUB_OUT heading to my location
      const subOutParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", status: "GATE_OUT", limit: "50" });
      if (user.defaultLocation) subOutParams.set("toLocation", user.defaultLocation);
      const [ownRes, incomingRes] = await Promise.all([
        fetch("/api/gate-pass?passType=AFTER_SALES&limit=100"),
        fetch(`/api/gate-pass?${subOutParams}`),
      ]);
      const ownData = ownRes.ok ? await ownRes.json() : { passes: [] };
      const incomingData = incomingRes.ok ? await incomingRes.json() : { passes: [] };

      const own = (ownData.passes || []).filter((p: GatePass) =>
        (p.passSubType === "SUB_OUT_IN" && (p.status === "APPROVED" || p.status === "GATE_OUT"))
        || (p.passSubType === "SUB_IN" && p.status === "GATE_OUT")
      );
      // Only SUB_OUT passes heading TO this initiator's location (arriving, not leaving)
      const incoming = (incomingData.passes || []).filter((p: GatePass) =>
        p.passSubType === "SUB_OUT" && p.status === "GATE_OUT"
        && (!user.defaultLocation || p.toLocation === user.defaultLocation)
      );
      const seen = new Set<string>();
      const merged: GatePass[] = [];
      for (const p of [...own, ...incoming]) {
        if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
      }
      prevArrivingCount.current = merged.length;
      setArrivingVehicles(merged);
    } finally { setArrivingLoading(false); }
  }, [isASO, user.defaultLocation]);

  const fetchMainInActive = useCallback(async () => {
    if (isASO) return;
    setMainInLoading(true);
    try {
      const params = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "MAIN_IN", status: "GATE_OUT", limit: "50" });
      const res = await fetch(`/api/gate-pass?${params}`);
      if (!res.ok) return;
      const d = await res.json();
      setMainInActive(d.passes || []);
    } finally { setMainInLoading(false); }
  }, [isASO]);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "10" });
    if (search) params.set("search", search);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const d = await res.json();
        const collapsed = collapseJourneyRows(d.passes || []);
        setPasses(collapsed);
        setTotal(collapsed.length);
        setTotalPages(1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // Poll notifications every 15s — refresh Vehicle Arrivals when GATE_PASS_RECEIVED arrives
  const lastArrivalsNotif = useRef(0);
  useEffect(() => {
    if (isASO) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        const count = (data.notifications ?? []).filter(
          (n: { type: string; read: boolean }) => n.type === "GATE_PASS_RECEIVED" && !n.read
        ).length;
        if (count > lastArrivalsNotif.current) {
          lastArrivalsNotif.current = count;
          // Fetch new arrivals and detect if count increased
          const prevCount = prevArrivingCount.current;
          await fetchArrivingVehicles();
          // After fetch, if arrivingVehicles count increased, show toast
          // (check via a brief delay to allow state to settle)
          setTimeout(() => {
            if (prevArrivingCount.current > prevCount) {
              const added = prevArrivingCount.current - prevCount;
              setNewArrivalToast(`${added} vehicle${added !== 1 ? "s" : ""} arriving at your location`);
              setHasNewArrivals(true);
              setTimeout(() => setNewArrivalToast(null), 5000);
            }
          }, 500);
        } else {
          lastArrivalsNotif.current = count;
        }
      } catch { /* ignore */ }
    }, 15_000);
    return () => clearInterval(poll);
  }, [isASO, fetchArrivingVehicles]);

  // Mark a non-AFTER_SALES (LT/CD) approved pass as Gate Out directly from table
  const handleMarkOut = useCallback(async (id: string) => {
    setMarkingOutId(id);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_out" }),
      });
      if (res.ok) {
        await fetchPasses();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to mark as Gate Out: ${err.error || res.statusText}. Please try refreshing the page and logging in again.`);
      }
    } finally {
      setMarkingOutId(null);
    }
  }, [fetchPasses]);

  const handleConfirmArrived = useCallback(async (id: string) => {
    if (!confirm("Confirm vehicle has arrived?")) return;
    setConfirmingArrivedId(id);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_in" }),
      });
      if (res.ok) {
        await fetchArrivingVehicles();
        await fetchPasses();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to confirm arrival: ${err.error || res.statusText}`);
      }
    } finally {
      setConfirmingArrivedId(null);
    }
  }, [fetchArrivingVehicles, fetchPasses]);

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

      {/* New arrival toast notification */}
      {newArrivalToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border"
          style={{ background: "#064e3b", borderColor: "#10b981", color: "#fff", minWidth: 260, maxWidth: 380 }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#10b981" }}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">Vehicle Arriving</p>
            <p className="text-xs opacity-80 mt-0.5">{newArrivalToast}</p>
          </div>
          <button onClick={() => setNewArrivalToast(null)} className="opacity-60 hover:opacity-100 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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

      {/* ASO: Incoming Vehicles panel */}
      {isASO && (
        <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background: "var(--surface)", borderColor: "#3b82f680", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)", background: "#eff6ff" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#3b82f620" }}>
                <svg className="w-4 h-4" style={{ color: "#3b82f6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l-3-3m3 3l3-3" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-sm" style={{ color: "#1d4ed8" }}>Vehicles Incoming</h2>
                <p className="text-xs" style={{ color: "#3b82f6" }}>Vehicles en route — create SUB IN pass to receive them</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {incoming.length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "#3b82f620", color: "#1d4ed8" }}>
                  {incoming.length} vehicle{incoming.length !== 1 ? "s" : ""}
                </span>
              )}
              <button onClick={() => void fetchIncoming()} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70"
                style={{ background: "#dbeafe" }}>
                <svg className="w-3.5 h-3.5" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-4">
            {incomingLoading ? (
              <div className="flex items-center gap-3 py-4 px-2">
                <svg className="animate-spin w-5 h-5" style={{ color: "#3b82f6" }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading incoming vehicles…</span>
              </div>
            ) : incoming.length === 0 ? (
              <div className="flex items-center gap-3 py-4 px-3 rounded-xl" style={{ background: "var(--surface2)" }}>
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No vehicles incoming{user.defaultLocation ? ` to ${user.defaultLocation}` : ""}. Create a <strong>SUB OUT</strong> pass when sending a vehicle back.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {incoming.map((v) => (
                  <motion.div
                    key={v.id}
                    className="rounded-xl border overflow-hidden"
                    style={{ background: v.hasActiveSubIn ? "#f0fdf4" : "#f0f9ff", borderColor: v.hasActiveSubIn ? "#bbf7d0" : "#bfdbfe" }}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: v.hasActiveSubIn ? "#dcfce7" : "#dbeafe" }}>
                        <svg className="w-4 h-4" style={{ color: v.hasActiveSubIn ? "#15803d" : "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 8h4l3 3v5h-7V8z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs font-mono" style={{ color: "#1d4ed8" }}>{v.gatePassNumber}</span>
                          <span className="font-bold text-sm" style={{ color: "var(--text)" }}>{v.vehicle}</span>
                          {v.chassis && <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>{v.chassis}</span>}
                          {(v.make || v.vehicleColor) && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{[v.make, v.vehicleColor].filter(Boolean).join(" · ")}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                            <span>{v.fromLocation || "—"}</span>
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            <span className="font-semibold" style={{ color: "#2563eb" }}>{v.toLocation || "—"}</span>
                          </div>
                          {(v.serviceJobNo || v.parentPass?.serviceJobNo) && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded font-semibold"
                              style={{ background: "#fef3c7", color: "#b45309" }}>
                              Job: {v.serviceJobNo ?? v.parentPass?.serviceJobNo}
                            </span>
                          )}
                          {v.requestedBy && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>By: {v.requestedBy}</span>
                          )}
                          {v.departureDate && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{v.departureDate}</span>
                          )}
                        </div>
                      </div>
                      {/* Action area */}
                      {v.hasActiveSubIn ? (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0"
                          style={{ background: "#dcfce7", color: "#15803d" }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          SUB IN Created
                        </div>
                      ) : (
                        <Link
                          href={`/gate-pass/create-sub-in/${v.id}`}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold flex-shrink-0 hover:opacity-90 transition-opacity"
                          style={{ background: "linear-gradient(135deg,#065f46,#059669)" }}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
                          </svg>
                          Create SUB IN
                        </Link>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Security-created DRAFT passes needing completion */}
      {draftPasses.length > 0 && (
        <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background: "var(--surface)", borderColor: "#f59e0b80", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)", background: "#fffbeb" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#fef3c7" }}>
                <svg className="w-4 h-4" style={{ color: "#b45309" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-sm" style={{ color: "#92400e" }}>Security Created Passes — Action Required</h2>
                <p className="text-xs" style={{ color: "#b45309" }}>Security Officer registered these vehicles. Please open and complete the details.</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "#fef3c7", color: "#92400e" }}>
              {draftPasses.length} pending
            </span>
          </div>
          <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {draftPasses.map((p) => {
              const dirLabel = (p as any).gateDirection === "IN" ? "Gate IN" : "Gate OUT";
              const typeLabel = p.passType === "AFTER_SALES" ? "After Sales" : p.passType === "LOCATION_TRANSFER" ? "Location Transfer" : "Customer Delivery";
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold font-mono" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>{typeLabel}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: (p as any).gateDirection === "IN" ? "#f0fdfa" : "#eef2ff", color: (p as any).gateDirection === "IN" ? "#0f766e" : "#3730a3" }}>{dirLabel}</span>
                    </div>
                    <p className="text-sm font-semibold font-mono mt-0.5" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>By Security · {p.createdBy.name}</p>
                  </div>
                  <Link
                    href={`/gate-pass/create?draftId=${p.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Complete
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INITIATOR: Vehicles Arriving panel (SUB_IN created by ASO) */}
      {!isASO && (
        <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background: "var(--surface)", borderColor: "#10b98180", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b cursor-pointer" style={{ borderColor: "var(--border)", background: "#f0fdf4" }} onClick={() => setHasNewArrivals(false)}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#10b98120" }}>
                <svg className="w-4 h-4" style={{ color: "#10b981" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-sm" style={{ color: "#065f46" }}>After Sales Vehicles</h2>
                <p className="text-xs" style={{ color: "#10b981" }}>Track service vehicles — confirm arrival when returned from service centre</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {arrivingVehicles.length > 0 && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${hasNewArrivals ? "animate-pulse" : ""}`}
                  style={{ background: hasNewArrivals ? "#10b981" : "#10b98120", color: hasNewArrivals ? "#fff" : "#065f46" }}>
                  {hasNewArrivals && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                  )}
                  {arrivingVehicles.length} vehicle{arrivingVehicles.length !== 1 ? "s" : ""}
                  {hasNewArrivals && <span className="font-extrabold tracking-wide">NEW</span>}
                </span>
              )}
              <button onClick={() => { void fetchArrivingVehicles(); setHasNewArrivals(false); }} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70"
                style={{ background: "#dcfce7" }}>
                <svg className="w-3.5 h-3.5" style={{ color: "#059669" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-4">
            {arrivingLoading ? (
              <div className="flex items-center gap-3 py-4 px-2">
                <svg className="animate-spin w-5 h-5" style={{ color: "#10b981" }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading arriving vehicles…</span>
              </div>
            ) : arrivingVehicles.length === 0 ? (
              <div className="flex items-center gap-3 py-4 px-3 rounded-xl" style={{ background: "var(--surface2)" }}>
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active after sales vehicles. When a vehicle is at a service centre or returning, it will appear here.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {arrivingVehicles.map((v) => {
                  const isReturning = v.passSubType === "SUB_OUT_IN";
                  const isSubOutArriving = v.passSubType === "SUB_OUT";
                  const accent = isReturning ? { bg: "#f0fdf4", border: "#bbf7d0", iconBg: "#dcfce7", iconColor: "#15803d", textColor: "#065f46", badgeBg: v.status === "GATE_OUT" ? "#dbeafe" : "#dcfce7", badgeColor: v.status === "GATE_OUT" ? "#1d4ed8" : "#15803d", badgeLabel: v.status === "GATE_OUT" ? "En Route" : "Ready" }
                    : isSubOutArriving ? { bg: "#eff6ff", border: "#bfdbfe", iconBg: "#dbeafe", iconColor: "#1d4ed8", textColor: "#1d4ed8", badgeBg: "#dbeafe", badgeColor: "#1d4ed8", badgeLabel: "En Route → Your Location" }
                    : { bg: "#fffbeb", border: "#fde68a", iconBg: "#fef3c7", iconColor: "#b45309", textColor: "#92400e", badgeBg: "#fef3c7", badgeColor: "#92400e", badgeLabel: "At Service Centre" };
                  return (
                  <motion.div
                    key={v.id}
                    className="rounded-xl border overflow-hidden"
                    style={{ background: accent.bg, borderColor: accent.border }}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    {/* Top stripe */}
                    <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accent.iconColor}, ${accent.iconColor}44)` }} />

                    <div className="p-4">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent.iconBg }}>
                            <svg className="w-4 h-4" style={{ color: accent.iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 8h4l3 3v5h-7V8z" />
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm font-mono" style={{ color: accent.textColor }}>{v.gatePassNumber}</span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: accent.badgeBg, color: accent.badgeColor }}>{accent.badgeLabel}</span>
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>By: {v.createdBy?.name}</p>
                          </div>
                        </div>
                        {/* Action button */}
                        {isReturning ? (
                          <button
                            onClick={() => void handleConfirmArrived(v.id)}
                            disabled={confirmingArrivedId === v.id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold flex-shrink-0 hover:opacity-90 transition-opacity disabled:opacity-60"
                            style={{ background: "linear-gradient(135deg,#065f46,#059669)" }}
                          >
                            {confirmingArrivedId === v.id ? (
                              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            Confirm Arrived
                          </button>
                        ) : isSubOutArriving ? (
                          <a href={`/gate-pass/${v.id}`}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0 hover:opacity-80"
                            style={{ background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View Pass
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0"
                            style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Awaiting Initiator
                          </span>
                        )}
                      </div>

                      {/* Vehicle details grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 rounded-lg px-3 py-2.5" style={{ background: "rgba(255,255,255,0.55)" }}>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>Vehicle</p>
                          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{v.vehicle}</p>
                        </div>
                        {v.chassis && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>Chassis No</p>
                            <p className="text-xs font-mono font-semibold" style={{ color: "var(--text)" }}>{v.chassis}</p>
                          </div>
                        )}
                        {v.make && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>Make</p>
                            <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{v.make}</p>
                          </div>
                        )}
                        {v.vehicleColor && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>Color</p>
                            <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{v.vehicleColor}</p>
                          </div>
                        )}
                        {(v.departureDate || v.departureTime) && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>Departed</p>
                            <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{v.departureDate} {v.departureTime}</p>
                          </div>
                        )}
                      </div>

                      {/* Route bar */}
                      {(v.fromLocation || v.toLocation) && (
                        <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.55)" }}>
                          <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{v.fromLocation || "—"}</span>
                          <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accent.iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                          <span className="text-xs font-semibold" style={{ color: accent.textColor }}>{v.toLocation || "—"}</span>
                          {isSubOutArriving && (
                            <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#fef9c3", color: "#854d0e" }}>
                              Security Gate IN required
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INITIATOR: After Sales Active — MAIN_IN at HQ (GATE_OUT status) */}
      {!isASO && (
        <div className="rounded-2xl border mb-6 overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "#8b5cf680", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--border)", background: "#faf5ff" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#8b5cf620" }}>
                <svg className="w-4 h-4" style={{ color: "#8b5cf6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-sm" style={{ color: "#5b21b6" }}>After Sales — Vehicles at HQ</h2>
                <p className="text-xs" style={{ color: "#8b5cf6" }}>
                  Vehicles received at HQ — send to sub-location or issue MAIN OUT
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {mainInActive.length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: "#8b5cf620", color: "#5b21b6" }}>
                  {mainInActive.length} vehicle{mainInActive.length !== 1 ? "s" : ""}
                </span>
              )}
              <button onClick={() => void fetchMainInActive()}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70"
                style={{ background: "#ede9fe" }}>
                <svg className="w-3.5 h-3.5" style={{ color: "#7c3aed" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-4">
            {mainInLoading ? (
              <div className="flex items-center gap-3 py-4 px-2">
                <svg className="animate-spin w-5 h-5" style={{ color: "#8b5cf6" }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</span>
              </div>
            ) : mainInActive.length === 0 ? (
              <div className="flex items-center gap-3 py-4 px-3 rounded-xl" style={{ background: "var(--surface2)" }}>
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No vehicles currently at HQ awaiting action.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {mainInActive.map((v) => (
                  <motion.div
                    key={v.id}
                    className="rounded-xl border overflow-hidden"
                    style={{ background: "#faf5ff", borderColor: "#d8b4fe" }}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "#ede9fe" }}>
                        <svg className="w-4 h-4" style={{ color: "#7c3aed" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M13 8h4l3 3v5h-7V8z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs font-mono" style={{ color: "#5b21b6" }}>{v.gatePassNumber}</span>
                          <span className="font-bold text-sm" style={{ color: "var(--text)" }}>{v.vehicle}</span>
                          {v.chassis && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                              style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                              {v.chassis}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                          {v.toLocation && (
                            <span className="font-semibold" style={{ color: "#5b21b6" }}>At: {v.toLocation}</span>
                          )}
                          {v.requestedBy && <span>By: {v.requestedBy}</span>}
                          {v.departureDate && <span>{v.departureDate}</span>}
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                          href={`/gate-pass/create-sub-out/${v.id}`}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
                          style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)" }}
                          title="Send vehicle to sub-location for service"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                          SUB OUT
                        </Link>
                        <Link
                          href={`/gate-pass/create-main-out/${v.id}`}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
                          style={{ background: "linear-gradient(135deg,#5b21b6,#8b5cf6)" }}
                          title="Issue final MAIN OUT for customer delivery"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          MAIN OUT
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
                <th className="w-1 p-0" />
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
                  const isReceivedSubOut =
                    p.passType === "AFTER_SALES" &&
                    p.passSubType === "SUB_OUT" &&
                    p.status === "COMPLETED" &&
                    !!user.defaultLocation &&
                    p.toLocation === user.defaultLocation;
                  const rawSc = statusCfg[p.status] || statusCfg["PENDING_APPROVAL"];
                  const sc = isReceivedSubOut
                    ? { ...rawSc, label: "Sub In" }
                    : rawSc;
                  const canPrint = p.status === "APPROVED" || p.status === "GATE_OUT" || p.status === "COMPLETED";
                  const needsAttention = ["PENDING_APPROVAL", "CASHIER_REVIEW", "REJECTED"].includes(p.status);
                  const attentionColor = p.status === "REJECTED" ? "#ef4444" : p.status === "CASHIER_REVIEW" ? "#d97706" : "#f59e0b";
                  const attentionRowBg = p.status === "REJECTED" ? "rgba(239,68,68,0.04)" : p.status === "CASHIER_REVIEW" ? "rgba(245,158,11,0.05)" : "rgba(245,158,11,0.06)";
                  const displaySubType = isReceivedSubOut ? "SUB_IN" : p.passSubType;
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="group transition-colors relative"
                      style={{ borderBottom: `1px solid var(--border)`, background: needsAttention ? attentionRowBg : "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = needsAttention ? attentionRowBg : "var(--surface2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = needsAttention ? attentionRowBg : "transparent")}
                    >
                      {/* Attention accent — left border stripe */}
                      <td className="py-3 pl-0 pr-0 w-1" style={{ padding: 0 }}>
                        {needsAttention && (
                          <div className="w-1 h-full min-h-[44px] rounded-r-full" style={{ background: attentionColor }} />
                        )}
                      </td>
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
                        {displaySubType && (
                          <span className="block text-xs mt-0.5 font-semibold" style={{ color: displaySubType === "MAIN_IN" || displaySubType === "SUB_IN" ? "#059669" : displaySubType === "MAIN_OUT" ? "#7c3aed" : "#d97706" }}>
                            {displaySubType.replace("_", " ")}
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
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.toLocation || "-"}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.createdBy.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{p.departureDate || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {needsAttention ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border"
                              style={{ background: sc.bg, color: sc.color, borderColor: attentionColor + "55" }}>
                              <span className="relative flex h-2 w-2 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: attentionColor }} />
                                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: attentionColor }} />
                              </span>
                              {sc.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.color }} />
                              {sc.label}
                            </span>
                          )}
                        </div>
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

      {/* Sub IN Quick Modal (ASO) */}
      <AnimatePresence>
        {subInModal && (
          <SubInModal
            vehicle={subInModal}
            onClose={() => setSubInModal(null)}
            onDone={() => {
              setSubInModal(null);
              void fetchIncoming();
              void fetchPasses();
            }}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
