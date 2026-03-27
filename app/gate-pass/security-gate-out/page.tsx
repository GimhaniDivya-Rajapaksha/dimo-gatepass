"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

type Pass = {
  id: string;
  gatePassNumber: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  vehicleColor: string | null;
  paymentType: string | null;
  passType: string;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  departureDate: string | null;
  requestedBy: string | null;
  companyName: string | null;
  carrierRegNo: string | null;
  driverName: string | null;
  driverNIC: string | null;
  driverContact: string | null;
  toLocation: string | null;
  fromLocation: string | null;
  passSubType: string | null;
  createdBy: { name: string };
  approvedBy: { name: string } | null;
};

/* ── Colour palette ── */
const colorMap: Record<string, { hex: string; border: string; label: string }> = {
  "White":           { hex: "#f8fafc", border: "#cbd5e1", label: "White" },
  "Pearl White":     { hex: "#f0f4f8", border: "#94a3b8", label: "Pearl White" },
  "Off White":       { hex: "#fafaf7", border: "#d1d5db", label: "Off White" },
  "Black":           { hex: "#111827", border: "#374151", label: "Black" },
  "Midnight Black":  { hex: "#0f172a", border: "#334155", label: "Midnight Black" },
  "Jet Black":       { hex: "#1c1c1e", border: "#3f3f46", label: "Jet Black" },
  "Silver":          { hex: "#c0c5ce", border: "#94a3b8", label: "Silver" },
  "Metallic Silver": { hex: "#a8b2bc", border: "#64748b", label: "Silver" },
  "Grey":            { hex: "#6b7280", border: "#4b5563", label: "Grey" },
  "Dark Grey":       { hex: "#374151", border: "#1f2937", label: "Dark Grey" },
  "Graphite":        { hex: "#4b5563", border: "#374151", label: "Graphite" },
  "Blue":            { hex: "#2563eb", border: "#1d4ed8", label: "Blue" },
  "Navy Blue":       { hex: "#1e3a8a", border: "#1e3a8a", label: "Navy Blue" },
  "Dark Blue":       { hex: "#1e3a8a", border: "#1e40af", label: "Dark Blue" },
  "Azure Blue":      { hex: "#0ea5e9", border: "#0284c7", label: "Azure Blue" },
  "Cobalt Blue":     { hex: "#2563eb", border: "#1d4ed8", label: "Cobalt Blue" },
  "Sky Blue":        { hex: "#38bdf8", border: "#0284c7", label: "Sky Blue" },
  "Red":             { hex: "#dc2626", border: "#b91c1c", label: "Red" },
  "Crimson Red":     { hex: "#be123c", border: "#9f1239", label: "Crimson" },
  "Dark Red":        { hex: "#991b1b", border: "#7f1d1d", label: "Dark Red" },
  "Maroon":          { hex: "#7f1d1d", border: "#450a0a", label: "Maroon" },
  "Green":           { hex: "#16a34a", border: "#15803d", label: "Green" },
  "Jungle Green":    { hex: "#14532d", border: "#052e16", label: "Jungle Green" },
  "Olive Green":     { hex: "#365314", border: "#1a2e05", label: "Olive" },
  "Orange":          { hex: "#ea580c", border: "#c2410c", label: "Orange" },
  "Yellow":          { hex: "#ca8a04", border: "#a16207", label: "Yellow" },
  "Gold":            { hex: "#d97706", border: "#b45309", label: "Gold" },
  "Champagne Gold":  { hex: "#d4a04a", border: "#b5832a", label: "Champagne" },
  "Brown":           { hex: "#78350f", border: "#451a03", label: "Brown" },
  "Beige":           { hex: "#d6c5a0", border: "#a08960", label: "Beige" },
  "Purple":          { hex: "#7c3aed", border: "#6d28d9", label: "Purple" },
  "Twilight Purple": { hex: "#4c1d95", border: "#3b0764", label: "Twilight" },
};

function getColor(name: string | null) {
  if (!name) return { hex: "#94a3b8", border: "#64748b", label: "—" };
  return colorMap[name]
    ?? Object.entries(colorMap).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
    ?? { hex: "#94a3b8", border: "#64748b", label: name };
}

/* ── Car SVG ── */
function CarSVG({ size = 28, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 56 30" fill="none">
      <rect x="2" y="14" width="52" height="11" rx="3" fill={color} opacity={0.95} />
      <path d="M13 14 L18 4 L38 4 L43 14Z" fill={color} opacity={0.9} />
      <path d="M19.5 5.5 L16 13h9.5V5.5Z" fill={color} opacity={0.35} />
      <path d="M36.5 5.5 L40 13h-9.5V5.5Z" fill={color} opacity={0.35} />
      <rect x="27" y="5.5" width="9" height="7.5" fill={color} opacity={0.35} />
      <circle cx="15" cy="25.5" r="4.5" fill="rgba(0,0,0,0.45)" />
      <circle cx="15" cy="25.5" r="2" fill={color} opacity={0.3} />
      <circle cx="41" cy="25.5" r="4.5" fill="rgba(0,0,0,0.45)" />
      <circle cx="41" cy="25.5" r="2" fill={color} opacity={0.3} />
      <rect x="53" y="16" width="2" height="4" rx="1" fill="#fde68a" opacity={0.9} />
      <rect x="1" y="16" width="2" height="4" rx="1" fill="#fca5a5" opacity={0.9} />
    </svg>
  );
}

/* ── Pass Card — inline slider + print + view details ── */
function PassCard({ p, mode, onConfirmed }: {
  p: Pass;
  mode: "out" | "in";
  onConfirmed: (id: string) => void;
}) {
  const isOut = mode === "out";
  const color = getColor(p.vehicleColor);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const [dragging, setDragging]   = useState(false);
  const [slidePos, setSlidePos]   = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  const headerFrom  = isOut ? "#1e1b4b" : "#042f2e";
  const headerTo    = isOut ? "#3730a3" : "#0f766e";
  const accentLight = isOut ? "#818cf8" : "#2dd4bf";
  const accentGlow  = isOut ? "rgba(99,102,241,0.35)" : "rgba(20,184,166,0.35)";
  const pillBg      = isOut ? "rgba(129,140,248,0.18)" : "rgba(45,212,191,0.18)";
  const pillColor   = isOut ? "#c7d2fe" : "#99f6e4";

  const passTypeLabel = p.passType === "LOCATION_TRANSFER" ? "Location Transfer"
    : p.passType === "CUSTOMER_DELIVERY" ? "Customer Delivery"
    : p.passSubType ? p.passSubType.replace(/_/g, " ") : "After Sales";

  const payLabel = p.paymentType === "CREDIT" ? "Credit"
    : p.paymentType === "INVOICED" ? "Invoiced"
    : p.paymentType === "CASH" ? "Cash" : null;

  async function confirm() {
    setConfirming(true);
    setErr(null);
    try {
      const res = await fetch(`/api/gate-pass/${p.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isOut ? "security_gate_out" : "security_gate_in" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      setDone(true);
      setTimeout(() => onConfirmed(p.id), 1500);
    } catch (e) {
      setConfirming(false);
      setSlidePos(0);
      setErr(e instanceof Error ? e.message : "Action failed");
    }
  }

  function handleSlide(clientX: number) {
    const max = (trackRef.current?.offsetWidth ?? 300) - 60;
    if (isOut) {
      const pos = Math.max(0, Math.min(max, clientX - startXRef.current));
      setSlidePos(pos);
      if (pos >= max - 4) { setDragging(false); setSlidePos(0); void confirm(); }
    } else {
      const pos = Math.max(0, Math.min(max, startXRef.current - clientX));
      setSlidePos(pos);
      if (pos >= max - 4) { setDragging(false); setSlidePos(0); void confirm(); }
    }
  }

  if (done) {
    return (
      <motion.div
        animate={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.5 }}
        className="rounded-3xl p-10 flex flex-col items-center justify-center gap-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: isOut ? "rgba(99,102,241,0.15)" : "rgba(20,184,166,0.15)" }}>
          <svg className="w-7 h-7" style={{ color: isOut ? "#818cf8" : "#2dd4bf" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-bold text-sm" style={{ color: "var(--text)" }}>Gate {isOut ? "OUT" : "IN"} Confirmed!</p>
        <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{p.gatePassNumber}</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="rounded-3xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isOut ? "rgba(99,102,241,0.25)" : "rgba(20,184,166,0.25)"}`,
        boxShadow: `0 4px 24px ${accentGlow}`,
      }}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
    >
      {/* ── Hero header ── */}
      <div className="relative px-5 pt-5 pb-5 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${headerFrom} 0%, ${headerTo} 100%)` }}>
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${accentLight}30 0%, transparent 70%)` }} />

        {/* Badges */}
        <div className="flex items-center gap-2 mb-3 flex-wrap relative z-10">
          <span className="text-[10px] font-black px-2.5 py-1 rounded-lg tracking-widest uppercase"
            style={{ background: pillBg, color: pillColor, border: `1px solid ${accentLight}30` }}>
            {isOut ? "▶ OUT" : "◀ IN"} · {p.gatePassNumber}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}>
            {passTypeLabel}
          </span>
          {payLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: "rgba(34,197,94,0.25)", color: "#86efac" }}>
              {payLabel} ✓
            </span>
          )}
          {p.status === "INITIATOR_OUT" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: "rgba(168,85,247,0.25)", color: "#d8b4fe" }}>
              ✓ Initiator Confirmed
            </span>
          )}
        </div>

        {/* Vehicle number + colour swatch */}
        <div className="flex items-end gap-4 relative z-10">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center px-4 py-2 rounded-xl mb-1.5"
              style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
              <span className="text-2xl font-black tracking-widest text-white font-mono"
                style={{ letterSpacing: "0.12em", textShadow: `0 0 20px ${accentLight}60` }}>
                {p.vehicle}
              </span>
            </div>
            {p.make && (
              <p className="text-xs font-semibold" style={{ color: `${accentLight}cc` }}>{p.make}</p>
            )}
            {/* LT route */}
            {p.passType === "LOCATION_TRANSFER" && (p.fromLocation || p.toLocation) && (
              <p className="text-[10px] mt-1 font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                {p.fromLocation || "?"} → {p.toLocation || "?"}
              </p>
            )}
          </div>

          {/* Colour swatch */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl shadow-lg relative overflow-hidden"
              style={{ background: color.hex, border: `2.5px solid ${color.border}`, boxShadow: `0 4px 16px ${color.hex}60` }}>
              <div className="absolute inset-0 rounded-2xl"
                style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.45) 0%,transparent 55%)" }} />
            </div>
            <span className="text-[9px] font-bold text-center leading-tight max-w-[52px] truncate"
              style={{ color: `${accentLight}99` }}>
              {color.label === "—" ? "—" : color.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="px-4 pt-4 pb-4 flex flex-col gap-3">

        {/* Inline slide-to-confirm */}
        {confirming ? (
          <div className="relative rounded-2xl overflow-hidden"
            style={{ height: 60, background: `linear-gradient(135deg,${headerFrom},${headerTo})` }}>
            <div className="absolute bottom-3.5 left-4 right-4 flex gap-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex-1 h-px rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
              ))}
            </div>
            <motion.div className="absolute bottom-2.5"
              animate={{ x: isOut ? ["-40px", "460px"] : ["460px", "-40px"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeIn" }}>
              <CarSVG size={28} color="white" />
            </motion.div>
            <div className="absolute inset-0 flex items-start justify-center pt-2">
              <span className="text-xs font-bold text-white/90 tracking-widest uppercase">Confirming…</span>
            </div>
          </div>
        ) : (
          <div
            ref={trackRef}
            className="relative rounded-2xl select-none overflow-hidden"
            style={{ height: 60, background: `linear-gradient(135deg,${headerFrom},${headerTo})` }}
            onMouseMove={(e) => { if (dragging) handleSlide(e.clientX); }}
            onMouseUp={() => { if (dragging) { setDragging(false); setSlidePos(0); } }}
            onMouseLeave={() => { if (dragging) { setDragging(false); setSlidePos(0); } }}
            onTouchMove={(e) => { if (dragging) handleSlide(e.touches[0].clientX); }}
            onTouchEnd={() => { if (dragging) { setDragging(false); setSlidePos(0); } }}
          >
            {/* Track lines */}
            <div className="absolute bottom-3.5 pointer-events-none flex gap-1"
              style={{ left: isOut ? 68 : 4, right: isOut ? 4 : 68 }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex-1 h-px rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
              ))}
            </div>
            {/* Fill */}
            <div className="absolute inset-y-0 rounded-2xl pointer-events-none"
              style={{
                [isOut ? "left" : "right"]: 0,
                width: slidePos + 60,
                background: "linear-gradient(90deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05))",
                transition: dragging ? "none" : "width 0.12s",
              }} />
            {/* Label */}
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
              {!isOut && (
                <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                </svg>
              )}
              <span className="text-xs font-bold tracking-widest uppercase text-white/80">
                Slide to Gate {isOut ? "OUT" : "IN"}
              </span>
              {isOut && (
                <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              )}
            </div>
            {/* Car handle */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-[56px] h-[52px] rounded-2xl flex items-center justify-center cursor-grab active:cursor-grabbing"
              style={{
                [isOut ? "left" : "right"]: slidePos,
                background: "rgba(255,255,255,0.2)",
                border: "1.5px solid rgba(255,255,255,0.4)",
                backdropFilter: "blur(8px)",
              }}
              onMouseDown={(e) => {
                setDragging(true);
                startXRef.current = isOut ? e.clientX - slidePos : e.clientX + slidePos;
              }}
              onTouchStart={(e) => {
                setDragging(true);
                startXRef.current = isOut ? e.touches[0].clientX - slidePos : e.touches[0].clientX + slidePos;
              }}
            >
              <CarSVG size={26} color="white" />
            </motion.div>
          </div>
        )}

        {err && <p className="text-xs text-center font-semibold" style={{ color: "#ef4444" }}>{err}</p>}
        <p className="text-[10px] text-center" style={{ color: "var(--text-muted)" }}>
          Drag the car {isOut ? "→ right" : "← left"} to confirm vehicle {isOut ? "departure" : "arrival"}
        </p>

        {/* Print + View Details */}
        <div className="flex gap-2">
          <a
            href={`/gate-pass/${p.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface2)" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Gate Pass
          </a>
          <a
            href={`/gate-pass/${p.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-opacity hover:opacity-80"
            style={{
              borderColor: isOut ? "rgba(99,102,241,0.4)" : "rgba(20,184,166,0.4)",
              color: isOut ? "#818cf8" : "#2dd4bf",
              background: isOut ? "rgba(99,102,241,0.08)" : "rgba(20,184,166,0.08)",
            }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View More Details
          </a>
        </div>
      </div>
    </motion.div>
  );
}

type GateMode = "OUT" | "IN" | "BOTH";

/* ── Page ── */
export default function SecurityGateDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [outPasses, setOutPasses] = useState<Pass[]>([]);
  const [inPasses, setInPasses]   = useState<Pass[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [gateMode, setGateMode]   = useState<GateMode>("BOTH");
  const [search, setSearch]       = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("security_gate_mode") as GateMode | null;
      if (saved === "OUT" || saved === "IN" || saved === "BOTH") setGateMode(saved);
    } catch { /* ignore */ }
  }, []);

  function setMode(m: GateMode) {
    setGateMode(m);
    try { localStorage.setItem("security_gate_mode", m); } catch { /* ignore */ }
  }

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const myLocation = (session?.user as { defaultLocation?: string | null })?.defaultLocation ?? null;

    try {
      const [outRes, initiatorOutRes, inRes, subInRes] = await Promise.all([
        fetch("/api/gate-pass?status=APPROVED&limit=100"),
        fetch("/api/gate-pass?status=INITIATOR_OUT&limit=100"),
        fetch("/api/gate-pass?status=GATE_OUT&limit=100"),
        fetch("/api/gate-pass?status=APPROVED&passType=AFTER_SALES&passSubType=SUB_IN&limit=100"),
      ]);
      const [outData, initiatorOutData, inData, subInData] = await Promise.all([
        outRes.json(), initiatorOutRes.json(), inRes.json(), subInRes.json(),
      ]);

      const outLocation = (p: Pass) => !myLocation || !p.fromLocation || p.fromLocation === myLocation;
      const inLocation  = (p: Pass) => !myLocation || !p.toLocation  || p.toLocation  === myLocation;

      const approvedAll: Pass[] = outData.passes ?? [];
      const approvedGateOut = approvedAll.filter((p) =>
        !(p.passType === "AFTER_SALES" && p.passSubType === "SUB_IN") &&
        (p.passType === "LOCATION_TRANSFER" || outLocation(p))
      );
      setOutPasses([
        ...approvedGateOut,
        ...(initiatorOutData.passes ?? []).filter(outLocation),
      ]);

      const approvedSubIn: Pass[] = (subInData.passes ?? []).filter(inLocation);
      const allGateOut: Pass[]    = inData.passes ?? [];
      setInPasses([
        ...approvedSubIn,
        ...allGateOut.filter((p) =>
          inLocation(p) && (
            (p.passType === "AFTER_SALES" && (p.passSubType === "MAIN_IN" || p.passSubType === "SUB_OUT_IN")) ||
            p.passType === "CUSTOMER_DELIVERY" ||
            p.passType === "LOCATION_TRANSFER"
          )
        ),
      ]);
    } catch {
      showToast("Failed to refresh passes.", false);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => { void fetchAll(); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    if (status !== "loading" && (!session || session.user?.role !== "SECURITY_OFFICER")) {
      router.replace("/");
    }
  }, [status, session, router]);

  if (status === "loading") return null;
  if (!session || session.user?.role !== "SECURITY_OFFICER") return null;

  // Search filter — vehicle number, make, colour
  const q = search.trim().toLowerCase();
  const filterPass = (p: Pass) =>
    !q ||
    p.vehicle.toLowerCase().includes(q) ||
    (p.make ?? "").toLowerCase().includes(q) ||
    (p.vehicleColor ?? "").toLowerCase().includes(q) ||
    p.gatePassNumber.toLowerCase().includes(q);

  const filteredOut = outPasses.filter(filterPass);
  const filteredIn  = inPasses.filter(filterPass);

  function handleConfirmed(id: string, mode: "out" | "in") {
    if (mode === "out") setOutPasses(prev => prev.filter(p => p.id !== id));
    else setInPasses(prev => prev.filter(p => p.id !== id));
    showToast(`Gate ${mode === "out" ? "OUT" : "IN"} confirmed successfully!`);
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold"
            style={{
              background: toast.ok ? "#f0fdf4" : "#fef2f2",
              color:      toast.ok ? "#15803d" : "#dc2626",
              border: `1px solid ${toast.ok ? "#bbf7d0" : "#fecaca"}`,
            }}
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page header ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#1e1b4b,#4f46e5)", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>Security Gate</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>Confirm vehicle movements at the gate</p>
            </div>
          </div>

          {/* Mode toggle + counts + refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              {(["OUT", "BOTH", "IN"] as GateMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className="px-3 py-1.5 text-xs font-bold transition-all"
                  style={{
                    background: gateMode === m
                      ? m === "OUT" ? "#3730a3" : m === "IN" ? "#0f766e" : "#374151"
                      : "var(--surface)",
                    color: gateMode === m ? "#fff" : "var(--text-muted)",
                    borderRight: m !== "IN" ? "1px solid var(--border)" : undefined,
                  }}>
                  {m === "OUT" ? "▶ OUT only" : m === "IN" ? "◀ IN only" : "Both"}
                </button>
              ))}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)" }}>
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />{outPasses.length} OUT
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: "rgba(20,184,166,0.12)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.2)" }}>
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />{inPasses.length} IN
            </div>
            <button onClick={() => void fetchAll()}
              className="w-9 h-9 rounded-xl border flex items-center justify-center hover:opacity-80 transition-opacity"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Search bar ── */}
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vehicle number, make, colour or GP number…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: "var(--border)", color: "var(--text-muted)" }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {q && (
          <p className="text-xs mt-2 px-1" style={{ color: "var(--text-muted)" }}>
            {filteredOut.length + filteredIn.length} result{filteredOut.length + filteredIn.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
          </p>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-3xl animate-pulse" style={{ background: "var(--surface)" }} />
          ))}
        </div>
      ) : (
        <div className={`grid gap-6 items-start ${gateMode === "BOTH" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 max-w-xl"}`}>

          {/* ── Gate OUT column ── */}
          {(gateMode === "OUT" || gateMode === "BOTH") && (
            <div className="flex flex-col gap-4">
              <div className="relative flex items-center gap-4 px-5 py-4 rounded-3xl overflow-hidden"
                style={{ background: "linear-gradient(135deg,#1e1b4b 0%,#3730a3 100%)", boxShadow: "0 6px 24px rgba(99,102,241,0.4)" }}>
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: "radial-gradient(ellipse at 80% 50%,rgba(129,140,248,0.25) 0%,transparent 60%)" }} />
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 relative z-10"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                  </svg>
                </div>
                <div className="flex-1 relative z-10">
                  <p className="text-base font-black text-white tracking-wide">Gate OUT</p>
                  <p className="text-xs text-indigo-200 mt-0.5">Approved — slide to release vehicle</p>
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center w-12 h-12 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <span className="text-xl font-black text-white leading-none">{filteredOut.length}</span>
                  <span className="text-[8px] text-white/60 uppercase tracking-wider">Queue</span>
                </div>
              </div>

              {filteredOut.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-4 rounded-3xl"
                  style={{ background: "var(--surface)", border: "1px dashed rgba(99,102,241,0.3)" }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: "rgba(99,102,241,0.08)" }}>
                    <svg className="w-8 h-8" style={{ color: "#6366f1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{q ? "No matches" : "All Clear"}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {q ? `No Gate OUT passes matching "${search}"` : "No vehicles pending gate release"}
                    </p>
                  </div>
                </div>
              ) : (
                filteredOut.map((p) => (
                  <PassCard key={p.id} p={p} mode="out" onConfirmed={(id) => handleConfirmed(id, "out")} />
                ))
              )}
            </div>
          )}

          {/* ── Gate IN column ── */}
          {(gateMode === "IN" || gateMode === "BOTH") && (
            <div className="flex flex-col gap-4">
              <div className="relative flex items-center gap-4 px-5 py-4 rounded-3xl overflow-hidden"
                style={{ background: "linear-gradient(135deg,#042f2e 0%,#0f766e 100%)", boxShadow: "0 6px 24px rgba(20,184,166,0.4)" }}>
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: "radial-gradient(ellipse at 80% 50%,rgba(45,212,191,0.25) 0%,transparent 60%)" }} />
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 relative z-10"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
                  </svg>
                </div>
                <div className="flex-1 relative z-10">
                  <p className="text-base font-black text-white tracking-wide">Gate IN</p>
                  <p className="text-xs text-teal-200 mt-0.5">Released — slide to confirm arrival</p>
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center w-12 h-12 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <span className="text-xl font-black text-white leading-none">{filteredIn.length}</span>
                  <span className="text-[8px] text-white/60 uppercase tracking-wider">Queue</span>
                </div>
              </div>

              {filteredIn.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-4 rounded-3xl"
                  style={{ background: "var(--surface)", border: "1px dashed rgba(20,184,166,0.3)" }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: "rgba(20,184,166,0.08)" }}>
                    <svg className="w-8 h-8" style={{ color: "#14b8a6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{q ? "No matches" : "All Clear"}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {q ? `No Gate IN passes matching "${search}"` : "No vehicles awaiting arrival confirmation"}
                    </p>
                  </div>
                </div>
              ) : (
                filteredIn.map((p) => (
                  <PassCard key={p.id} p={p} mode="in" onConfirmed={(id) => handleConfirmed(id, "in")} />
                ))
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
