"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

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

function fmt(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

/* Real vehicle colour palette */
const colorMap: Record<string, { hex: string; border: string; label: string }> = {
  /* Whites */
  "White":           { hex: "#f8fafc", border: "#cbd5e1", label: "White" },
  "Pearl White":     { hex: "#f0f4f8", border: "#94a3b8", label: "Pearl White" },
  "Off White":       { hex: "#fafaf7", border: "#d1d5db", label: "Off White" },
  /* Blacks */
  "Black":           { hex: "#111827", border: "#374151", label: "Black" },
  "Midnight Black":  { hex: "#0f172a", border: "#334155", label: "Midnight Black" },
  "Jet Black":       { hex: "#1c1c1e", border: "#3f3f46", label: "Jet Black" },
  /* Silvers & Greys */
  "Silver":          { hex: "#c0c5ce", border: "#94a3b8", label: "Silver" },
  "Metallic Silver": { hex: "#a8b2bc", border: "#64748b", label: "Silver" },
  "Grey":            { hex: "#6b7280", border: "#4b5563", label: "Grey" },
  "Dark Grey":       { hex: "#374151", border: "#1f2937", label: "Dark Grey" },
  "Graphite":        { hex: "#4b5563", border: "#374151", label: "Graphite" },
  /* Blues */
  "Blue":            { hex: "#2563eb", border: "#1d4ed8", label: "Blue" },
  "Navy Blue":       { hex: "#1e3a8a", border: "#1e3a8a", label: "Navy Blue" },
  "Dark Blue":       { hex: "#1e3a8a", border: "#1e40af", label: "Dark Blue" },
  "Azure Blue":      { hex: "#0ea5e9", border: "#0284c7", label: "Azure Blue" },
  "Cobalt Blue":     { hex: "#2563eb", border: "#1d4ed8", label: "Cobalt Blue" },
  "Sky Blue":        { hex: "#38bdf8", border: "#0284c7", label: "Sky Blue" },
  /* Reds */
  "Red":             { hex: "#dc2626", border: "#b91c1c", label: "Red" },
  "Crimson Red":     { hex: "#be123c", border: "#9f1239", label: "Crimson" },
  "Dark Red":        { hex: "#991b1b", border: "#7f1d1d", label: "Dark Red" },
  "Maroon":          { hex: "#7f1d1d", border: "#450a0a", label: "Maroon" },
  /* Greens */
  "Green":           { hex: "#16a34a", border: "#15803d", label: "Green" },
  "Jungle Green":    { hex: "#14532d", border: "#052e16", label: "Jungle Green" },
  "Olive Green":     { hex: "#365314", border: "#1a2e05", label: "Olive" },
  /* Warm tones */
  "Orange":          { hex: "#ea580c", border: "#c2410c", label: "Orange" },
  "Yellow":          { hex: "#ca8a04", border: "#a16207", label: "Yellow" },
  "Gold":            { hex: "#d97706", border: "#b45309", label: "Gold" },
  "Champagne Gold":  { hex: "#d4a04a", border: "#b5832a", label: "Champagne" },
  "Brown":           { hex: "#78350f", border: "#451a03", label: "Brown" },
  "Beige":           { hex: "#d6c5a0", border: "#a08960", label: "Beige" },
  /* Purples */
  "Purple":          { hex: "#7c3aed", border: "#6d28d9", label: "Purple" },
  "Twilight Purple": { hex: "#4c1d95", border: "#3b0764", label: "Twilight" },
};

function getColor(name: string | null) {
  if (!name) return { hex: "#94a3b8", border: "#64748b", label: "—" };
  // exact match first, then case-insensitive
  return colorMap[name]
    ?? Object.entries(colorMap).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
    ?? { hex: "#94a3b8", border: "#64748b", label: name };
}

/* ── Car SVG (side view) ── */
function CarSVG({ size = 28, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 56 30" fill="none">
      {/* body */}
      <rect x="2" y="14" width="52" height="11" rx="3" fill={color} opacity={0.95} />
      {/* cabin */}
      <path d="M13 14 L18 4 L38 4 L43 14Z" fill={color} opacity={0.9} />
      {/* windshields */}
      <path d="M19.5 5.5 L16 13h9.5V5.5Z" fill={color} opacity={0.35} />
      <path d="M36.5 5.5 L40 13h-9.5V5.5Z" fill={color} opacity={0.35} />
      <rect x="27" y="5.5" width="9" height="7.5" fill={color} opacity={0.35} />
      {/* wheels */}
      <circle cx="15" cy="25.5" r="4.5" fill="rgba(0,0,0,0.45)" />
      <circle cx="15" cy="25.5" r="2" fill={color} opacity={0.3} />
      <circle cx="41" cy="25.5" r="4.5" fill="rgba(0,0,0,0.45)" />
      <circle cx="41" cy="25.5" r="2" fill={color} opacity={0.3} />
      {/* headlight */}
      <rect x="53" y="16" width="2" height="4" rx="1" fill="#fde68a" opacity={0.9} />
      {/* tail light */}
      <rect x="1" y="16" width="2" height="4" rx="1" fill="#fca5a5" opacity={0.9} />
    </svg>
  );
}

/* ── Pass Card — redesigned ── */
function PassCard({ p, mode }: { p: Pass; mode: "out" | "in" }) {
  const isOut = mode === "out";
  const color = getColor(p.vehicleColor);

  const passTypeLabel = p.passType === "LOCATION_TRANSFER" ? "Location Transfer"
    : p.passType === "CUSTOMER_DELIVERY" ? "Customer Delivery"
    : p.passSubType ? p.passSubType.replace(/_/g, " ") : "After Sales";

  /* OUT: deep violet-indigo  |  IN: deep teal-cyan */
  const headerFrom  = isOut ? "#1e1b4b" : "#042f2e";
  const headerTo    = isOut ? "#3730a3" : "#0f766e";
  const accentGlow  = isOut ? "rgba(99,102,241,0.35)" : "rgba(20,184,166,0.35)";
  const accentLight = isOut ? "#818cf8" : "#2dd4bf";
  const accentDark  = isOut ? "#4f46e5" : "#0d9488";
  const pillBg      = isOut ? "rgba(129,140,248,0.18)" : "rgba(45,212,191,0.18)";
  const pillColor   = isOut ? "#c7d2fe" : "#99f6e4";

  /* payment badge colours */
  const payBg    = p.paymentType === "CREDIT"  ? "rgba(99,102,241,0.25)"
                 : p.paymentType === "MIXED"   ? "rgba(168,85,247,0.25)"
                 : p.paymentType === "INVOICED"? "rgba(34,197,94,0.25)"
                 :                               "rgba(34,197,94,0.25)";
  const payColor = p.paymentType === "CREDIT"  ? "#a5b4fc"
                 : p.paymentType === "MIXED"   ? "#d8b4fe"
                 : "#86efac";
  const payLabel = p.paymentType === "CREDIT"  ? "Credit ✓"
                 : p.paymentType === "MIXED"   ? "Mixed ✓"
                 : p.paymentType === "INVOICED"? "Invoiced ✓"
                 : p.paymentType === "NOT_INVOICED" ? "Not Invoiced"
                 : p.paymentType === "CASH"    ? "Cash ✓"
                 : null;

  /* pass-type chip */
  const ptBg    = p.passType === "CUSTOMER_DELIVERY" ? "rgba(232,121,249,0.2)"
                : p.passType === "LOCATION_TRANSFER"  ? "rgba(96,165,250,0.2)"
                :                                       "rgba(251,191,36,0.2)";
  const ptColor = p.passType === "CUSTOMER_DELIVERY" ? "#f0abfc"
                : p.passType === "LOCATION_TRANSFER"  ? "#93c5fd"
                :                                       "#fde68a";

  return (
    <motion.div
      className="rounded-3xl overflow-hidden"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isOut ? "rgba(99,102,241,0.25)" : "rgba(20,184,166,0.25)"}`,
        boxShadow: `0 4px 24px ${accentGlow}, 0 1px 3px rgba(0,0,0,0.08)`,
      }}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: `0 8px 32px ${accentGlow}, 0 2px 8px rgba(0,0,0,0.1)` }}
      transition={{ duration: 0.2 }}
    >
      {/* ── Hero header ── */}
      <div className="relative px-5 pt-5 pb-5 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${headerFrom} 0%, ${headerTo} 100%)` }}>
        {/* decorative blurred orb */}
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${accentLight}30 0%, transparent 70%)` }} />
        {/* top row: GP number + pass type + payment */}
        <div className="flex items-center gap-2 mb-3 flex-wrap relative z-10">
          <span className="text-[10px] font-black px-2.5 py-1 rounded-lg tracking-widest uppercase"
            style={{ background: pillBg, color: pillColor, border: `1px solid ${accentLight}30` }}>
            {isOut ? "▶ OUT" : "◀ IN"} · {p.gatePassNumber}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{ background: ptBg, color: ptColor }}>
            {passTypeLabel}
          </span>
          {isOut && payLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: payBg, color: payColor }}>
              {payLabel}
            </span>
          )}
          {isOut && p.status === "INITIATOR_OUT" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: "rgba(168,85,247,0.25)", color: "#d8b4fe" }}>
              ✓ Initiator Confirmed
            </span>
          )}
        </div>

        {/* Plate number — license-plate style */}
        <div className="flex items-end gap-4 relative z-10">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl mb-1.5"
              style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}>
              <span className="text-2xl font-black tracking-widest text-white font-mono leading-none"
                style={{ letterSpacing: "0.12em", textShadow: `0 0 20px ${accentLight}60` }}>
                {p.vehicle}
              </span>
            </div>
            {p.make && (
              <p className="text-xs font-semibold" style={{ color: `${accentLight}cc` }}>{p.make}</p>
            )}
          </div>

          {/* Colour swatch */}
          {p.vehicleColor ? (
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="w-12 h-12 rounded-2xl shadow-lg relative overflow-hidden"
                style={{
                  background: color.hex,
                  border: `2.5px solid ${color.border}`,
                  boxShadow: `0 4px 16px ${color.hex}60`,
                }}>
                <div className="absolute inset-0 rounded-2xl"
                  style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.45) 0%,transparent 55%)" }} />
              </div>
              <span className="text-[9px] font-bold text-center leading-tight max-w-[52px] truncate"
                style={{ color: `${accentLight}99` }}>{color.label}</span>
            </div>
          ) : (
            <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)", border: "1.5px dashed rgba(255,255,255,0.2)" }}>
              <span className="text-lg">🚗</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Chassis strip ── */}
      {p.chassis && (
        <div className="px-5 py-2.5 flex items-center gap-3"
          style={{
            background: isOut ? "rgba(99,102,241,0.06)" : "rgba(20,184,166,0.06)",
            borderBottom: `1px solid ${isOut ? "rgba(99,102,241,0.12)" : "rgba(20,184,166,0.12)"}`,
          }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: isOut ? "rgba(99,102,241,0.15)" : "rgba(20,184,166,0.15)" }}>
            <svg className="w-3.5 h-3.5" style={{ color: accentDark }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Chassis</span>
          <span className="text-xs font-black font-mono ml-auto" style={{ color: accentDark, letterSpacing: "0.06em" }}>{p.chassis}</span>
        </div>
      )}

      {/* ── Info grid ── */}
      <div className="px-5 pt-4 pb-3 grid grid-cols-2 gap-3">
        {/* Initiator */}
        <div className="col-span-2 flex items-center gap-3 p-3 rounded-2xl"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ background: `linear-gradient(135deg,${accentDark},${accentLight})` }}>
            {p.createdBy.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>Initiator</p>
            <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{p.createdBy.name}</p>
          </div>
          {p.approvedBy && (
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>Approved By</p>
              <p className="text-xs font-bold" style={{ color: "#22c55e" }}>{p.approvedBy.name}</p>
            </div>
          )}
        </div>

        {/* Location */}
        {(p.toLocation || p.fromLocation) && (
          <div className="p-3 rounded-2xl" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
              {isOut ? "To Location" : "From"}
            </p>
            <p className="text-xs font-bold leading-tight" style={{ color: "var(--text)" }}>
              {isOut ? p.toLocation : (p.fromLocation ?? p.toLocation)}
            </p>
          </div>
        )}

        {/* Date */}
        {p.departureDate && (
          <div className="p-3 rounded-2xl" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Date</p>
            <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{fmt(p.departureDate)}</p>
          </div>
        )}

        {/* Requested by */}
        {p.requestedBy && (
          <div className="p-3 rounded-2xl col-span-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Requested By</p>
            <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{p.requestedBy}</p>
          </div>
        )}
      </div>

      {/* ── Driver / Carrier strip ── */}
      {(p.companyName || p.driverName || p.carrierRegNo || p.driverNIC || p.driverContact) && (
        <div className="mx-4 mb-3 rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${isOut ? "rgba(99,102,241,0.18)" : "rgba(20,184,166,0.18)"}` }}>
          <div className="px-4 py-2 flex items-center gap-2"
            style={{ background: isOut ? "rgba(99,102,241,0.1)" : "rgba(20,184,166,0.1)" }}>
            <svg className="w-3.5 h-3.5" style={{ color: accentDark }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: accentDark }}>
              Carrier / Driver
            </span>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs" style={{ background: "var(--surface2)" }}>
            {[
              { icon: "🏢", label: "Company",    val: p.companyName,   mono: false },
              { icon: "🔢", label: "Reg No",     val: p.carrierRegNo,  mono: true  },
              { icon: "👤", label: "Driver",     val: p.driverName,    mono: false },
              { icon: "🪪", label: "NIC",        val: p.driverNIC,     mono: true  },
              { icon: "📞", label: "Contact",    val: p.driverContact, mono: true  },
            ].filter(x => x.val).map(({ icon, label, val, mono }) => (
              <div key={label} className="flex items-start gap-1.5">
                <span className="text-sm leading-none mt-0.5">{icon}</span>
                <div>
                  <p className="font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)", fontSize: "8px" }}>{label}</p>
                  <p className={`font-bold text-[11px]${mono ? " font-mono" : ""}`} style={{ color: "var(--text)" }}>{val}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA button ── */}
      <div className="px-4 pb-4">
        <Link href={`/gate-pass/${p.id}`}
          className="group flex items-center justify-between w-full px-5 py-3.5 rounded-2xl font-bold text-sm text-white transition-all active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${headerFrom} 0%, ${headerTo} 100%)`,
            border: `1px solid ${accentLight}40`,
            boxShadow: `0 4px 16px ${accentGlow}`,
          }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <CarSVG size={18} color="white" />
            </div>
            <span>Open &amp; Confirm Gate {isOut ? "OUT" : "IN"}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d={isOut ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7M19 19l-7-7 7-7"} />
            </svg>
          </div>
        </Link>
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

  // Load persisted mode from localStorage (each browser/officer keeps their own preference)
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
    // Security officer's assigned location (e.g. "Vehicle Park-1" for Security A, ASO location for Security B)
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

      // Location-aware filter:
      // Gate OUT = vehicle leaving FROM this officer's location (fromLocation matches, or no location set)
      // Gate IN  = vehicle arriving TO this officer's location (toLocation matches, or no location set)
      const outLocation = (p: Pass) => !myLocation || !p.fromLocation || p.fromLocation === myLocation;
      const inLocation  = (p: Pass) => !myLocation || !p.toLocation  || p.toLocation  === myLocation;

      // Gate OUT queue: APPROVED (non-SUB_IN) + INITIATOR_OUT
      const approvedAll: Pass[] = outData.passes ?? [];
      const approvedGateOut = approvedAll.filter((p) =>
        !(p.passType === "AFTER_SALES" && p.passSubType === "SUB_IN") && outLocation(p)
      );
      setOutPasses([
        ...approvedGateOut,
        ...(initiatorOutData.passes ?? []).filter(outLocation),
      ]);

      // Gate IN queue: APPROVED SUB_IN + GATE_OUT MAIN_IN/SUB_OUT_IN/CustomerDelivery
      const approvedSubIn: Pass[] = (subInData.passes ?? []).filter(inLocation);
      const allGateOut: Pass[] = inData.passes ?? [];
      setInPasses([
        ...approvedSubIn,
        ...allGateOut.filter((p) =>
          inLocation(p) && (
            (p.passType === "AFTER_SALES" && (p.passSubType === "MAIN_IN" || p.passSubType === "SUB_OUT_IN")) ||
            p.passType === "CUSTOMER_DELIVERY"
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

  useEffect(() => {
    if (status !== "loading" && (!session || session.user?.role !== "SECURITY_OFFICER")) {
      router.replace("/");
    }
  }, [status, session, router]);

  if (status === "loading") return null;
  if (!session || session.user?.role !== "SECURITY_OFFICER") return null;

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
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Icon */}
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
        {/* Mode toggle + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Gate mode toggle */}
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
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            {outPasses.length} OUT
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: "rgba(20,184,166,0.12)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.2)" }}>
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            {inPasses.length} IN
          </div>
          <button
            onClick={() => void fetchAll()}
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        /* Skeleton */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 rounded-3xl animate-pulse" style={{ background: "var(--surface)" }} />
          ))}
        </div>
      ) : (
        /* ── Divided layout: Gate OUT | Gate IN ── */
        <div className={`grid gap-6 items-start ${gateMode === "BOTH" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 max-w-xl"}`}>

          {/* ── Gate OUT column ── */}
          {(gateMode === "OUT" || gateMode === "BOTH") && <div className="flex flex-col gap-4">
            {/* Section banner */}
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
                <p className="text-xs text-indigo-200 mt-0.5">Approved — tap to release vehicle</p>
              </div>
              <div className="relative z-10 flex flex-col items-center justify-center w-12 h-12 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
                <span className="text-xl font-black text-white leading-none">{outPasses.length}</span>
                <span className="text-[8px] text-white/60 uppercase tracking-wider">Queue</span>
              </div>
            </div>

            {outPasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-4 rounded-3xl"
                style={{ background: "var(--surface)", border: "1px dashed rgba(99,102,241,0.3)" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(99,102,241,0.08)" }}>
                  <svg className="w-8 h-8" style={{ color: "#6366f1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>All Clear</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>No vehicles pending gate release</p>
                </div>
              </div>
            ) : (
              outPasses.map((p) => <PassCard key={p.id} p={p} mode="out" />)
            )}
          </div>}

          {/* ── Gate IN column ── */}
          {(gateMode === "IN" || gateMode === "BOTH") && <div className="flex flex-col gap-4">
            {/* Section banner */}
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
                <p className="text-xs text-teal-200 mt-0.5">Released — tap to confirm arrival</p>
              </div>
              <div className="relative z-10 flex flex-col items-center justify-center w-12 h-12 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
                <span className="text-xl font-black text-white leading-none">{inPasses.length}</span>
                <span className="text-[8px] text-white/60 uppercase tracking-wider">Queue</span>
              </div>
            </div>

            {inPasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-4 rounded-3xl"
                style={{ background: "var(--surface)", border: "1px dashed rgba(20,184,166,0.3)" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(20,184,166,0.08)" }}>
                  <svg className="w-8 h-8" style={{ color: "#14b8a6" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>All Clear</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>No vehicles awaiting arrival confirmation</p>
                </div>
              </div>
            ) : (
              inPasses.map((p) => <PassCard key={p.id} p={p} mode="in" />)
            )}
          </div>}

        </div>
      )}
    </div>
  );
}
