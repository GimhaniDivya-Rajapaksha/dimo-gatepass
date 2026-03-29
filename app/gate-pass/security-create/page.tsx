"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type PassType  = "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "AFTER_SALES";
type Direction = "IN" | "OUT";
type AssignTo  = "INITIATOR" | "SERVICE_ADVISOR";

type VehicleOption = {
  id: string;
  value: string;
  chassisNo?: string;
  make?: string;
  model?: string;
  colour?: string;
};

// ── Vehicle Search + optional Add (After Sales only) ─────────────────────────
function VehicleSearch({
  passType, onSelect, onClear, selected, showAddButton,
}: {
  passType: PassType;
  onSelect: (v: VehicleOption) => void;
  onClear: () => void;
  selected: VehicleOption | null;
  showAddButton?: boolean;
}) {
  const [query,   setQuery]   = useState("");
  const [options, setOptions] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [adding,  setAdding]  = useState(false);   // show add form
  const [saveLoading, setSaveLoading] = useState(false);
  const [addPlate,    setAddPlate]    = useState("");
  const [addChassis,  setAddChassis]  = useState("");
  const [addMake,     setAddMake]     = useState("");
  const [addError,    setAddError]    = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ field: "vehicle", q, limit: "50" });
      // AFTER_SALES → treated as "both" by SAP (all vehicles), LT/CD filter by status
      params.set("passType", passType);
      const res  = await fetch(`/api/lookups?${params}`);
      const data = await res.json() as { options?: VehicleOption[] };
      setOptions(data.options ?? []);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, [passType]);

  useEffect(() => { void load(""); }, [load]);

  const filtered = query.trim()
    ? options.filter(o =>
        o.value.toLowerCase().includes(query.toLowerCase()) ||
        (o.chassisNo ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : options;

  async function handleAdd() {
    const plate = addPlate.trim().toUpperCase();
    if (!plate) { setAddError("Vehicle number is required"); return; }

    // ── Check if already exists in loaded options (instant, no network) ──
    const existsLocally = options.some(
      o => o.value.toUpperCase() === plate ||
           (o.chassisNo ?? "").toUpperCase() === plate
    );
    if (existsLocally) {
      setAddError(`"${plate}" already exists in the system. Search for it above and select it.`);
      return;
    }

    setSaveLoading(true); setAddError("");
    try {
      // ── Double-check via API (covers edge case where options list was not fully loaded) ──
      const checkRes  = await fetch(`/api/lookups?field=vehicle&q=${encodeURIComponent(plate)}&passType=AFTER_SALES&limit=5`);
      const checkData = await checkRes.json() as { options?: VehicleOption[] };
      const serverMatch = (checkData.options ?? []).find(
        o => o.value.toUpperCase() === plate ||
             (o.chassisNo ?? "").toUpperCase() === plate
      );
      if (serverMatch) {
        setAddError(`"${plate}" already exists in the system. Search for it above and select it.`);
        // Also surface it in the dropdown so user can pick it
        setOptions(prev => prev.some(o => o.value === serverMatch.value) ? prev : [serverMatch, ...prev]);
        return;
      }

      // ── Save new vehicle ──
      const res = await fetch("/api/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: "vehicle",
          vehicleNo: plate,
          chassisNo: addChassis.trim() || null,
          make: addMake.trim() || null,
        }),
      });
      const d = await res.json() as { option?: VehicleOption; error?: string };
      if (!res.ok || !d.option) { setAddError(d.error ?? "Failed to save vehicle"); return; }
      onSelect(d.option);
      setAdding(false);
      setAddPlate(""); setAddChassis(""); setAddMake("");
    } catch { setAddError("Network error — please try again"); }
    finally { setSaveLoading(false); }
  }

  // ── Selected card ──────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="rounded-xl border px-4 py-3 flex items-center gap-3"
        style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
        <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black font-mono tracking-widest" style={{ color: "#15803d" }}>{selected.value}</p>
          {selected.chassisNo && (
            <p className="text-xs mt-0.5" style={{ color: "#16a34a" }}>
              {selected.chassisNo}{selected.make ? ` · ${selected.make}${selected.model ? ` ${selected.model}` : ""}` : ""}
            </p>
          )}
        </div>
        <button type="button" onClick={onClear}
          className="text-xs font-semibold underline flex-shrink-0" style={{ color: "#15803d" }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          autoComplete="off"
          value={query}
          onChange={e => { setQuery(e.target.value); void load(e.target.value); setOpen(true); }}
          onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true); }}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 200); }}
          placeholder="Search by vehicle no or chassis no"
          className="w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        {loading && (
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
            style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}

        <AnimatePresence>
          {open && (
            <motion.div
              className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-xl border shadow-xl"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            >
              {filtered.length > 0 ? filtered.map((o) => (
                <button key={o.id} type="button"
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-500/10 border-b last:border-b-0 flex items-center gap-3"
                  style={{ borderColor: "var(--border)" }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    onSelect(o); setQuery(""); setOpen(false);
                  }}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "#eff6ff" }}>
                    <svg className="w-3.5 h-3.5" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 1m0-7h8m0 0l2 4H5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{o.value}</p>
                    {o.chassisNo && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{o.chassisNo}</p>}
                  </div>
                  {(o.make || o.model) && (
                    <span className="text-xs flex-shrink-0 text-right" style={{ color: "var(--text-muted)" }}>
                      {[o.make, o.model].filter(Boolean).join(" ")}
                    </span>
                  )}
                </button>
              )) : (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  {query ? "No vehicles match your search" : "Loading vehicles…"}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Vehicle button — After Sales only */}
      {showAddButton && !adding && (
        <button type="button" onClick={() => { setAdding(true); setAddPlate(query.toUpperCase()); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:opacity-80"
          style={{ borderColor: "#a7f3d0", color: "#065f46", background: "#f0fdf4" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add vehicle not in list
        </button>
      )}

      {/* Inline Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "#6ee7b7", background: "#f0fdf4" }}
          >
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#065f46" }}>Add New Vehicle</p>
              <button type="button" onClick={() => { setAdding(false); setAddError(""); }}
                className="text-xs underline" style={{ color: "#065f46" }}>Cancel</button>
            </div>
            <div className="px-4 pb-4 flex flex-col gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#065f46" }}>
                  Vehicle Reg. No <span className="text-red-500">*</span>
                </label>
                <input
                  value={addPlate}
                  onChange={e => {
                    const v = e.target.value.toUpperCase();
                    setAddPlate(v);
                    setAddError("");
                    // Instant duplicate check against already-loaded options
                    if (v.length >= 3) {
                      const dup = options.some(
                        o => o.value.toUpperCase() === v ||
                             (o.chassisNo ?? "").toUpperCase() === v
                      );
                      if (dup) setAddError(`"${v}" already exists. Search and select it above.`);
                    }
                  }}
                  placeholder="e.g. WP-CAB-1234"
                  className="w-full px-3 py-2 rounded-lg border text-sm font-mono font-bold tracking-widest"
                  style={{ background: "#fff", borderColor: addError ? "#f87171" : "#6ee7b7", color: "#065f46" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#065f46" }}>VIN / Chassis No</label>
                  <input
                    value={addChassis}
                    onChange={e => setAddChassis(e.target.value.toUpperCase())}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ background: "#fff", borderColor: "#6ee7b7", color: "#065f46" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#065f46" }}>Make</label>
                  <input
                    value={addMake}
                    onChange={e => setAddMake(e.target.value)}
                    placeholder="e.g. Toyota"
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ background: "#fff", borderColor: "#6ee7b7", color: "#065f46" }}
                  />
                </div>
              </div>
              {addError && <p className="text-xs font-semibold" style={{ color: "#dc2626" }}>{addError}</p>}
              <button type="button" onClick={() => void handleAdd()} disabled={saveLoading || !addPlate.trim() || !!addError}
                className="w-full py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#064e3b,#065f46)", color: "#fff" }}>
                {saveLoading ? "Saving…" : "Save & Select Vehicle"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SecurityCreatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [passType,  setPassType]  = useState<PassType>("AFTER_SALES");
  const [direction, setDirection] = useState<Direction>("OUT");
  const [assignTo,  setAssignTo]  = useState<AssignTo>("INITIATOR");

  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);

  useEffect(() => {
    if (status !== "loading" && session?.user?.role !== "SECURITY_OFFICER") {
      router.replace("/");
    }
  }, [status, session, router]);

  if (status === "loading" || session?.user?.role !== "SECURITY_OFFICER") return null;

  function handlePassTypeChange(pt: PassType) {
    setPassType(pt);
    setSelectedVehicle(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVehicle) { setError("Vehicle registration number is required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/gate-pass/security-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passType,
          gateDirection: direction,
          assignTo,
          vehicle:      selectedVehicle.value.trim().toUpperCase(),
          chassis:      selectedVehicle.chassisNo?.trim() || null,
          make:         selectedVehicle.make?.trim() || null,
          vehicleColor: selectedVehicle.colour?.trim() || null,
        }),
      });
      const d = await res.json() as { gatePass?: { gatePassNumber: string }; error?: string };
      if (!res.ok) { setError(d.error ?? "Failed to create pass"); return; }
      const assignLabel = assignTo === "INITIATOR" ? "Initiator" : "Service Advisor";
      setSuccess(`${d.gatePass!.gatePassNumber} created — ${assignLabel} notified to complete.`);
      setTimeout(() => router.push("/gate-pass/security-gate-out"), 2500);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const passTypeOptions: { value: PassType; label: string; icon: string }[] = [
    { value: "AFTER_SALES",       label: "After Sales",       icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    { value: "LOCATION_TRANSFER", label: "Location Transfer", icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" },
    { value: "CUSTOMER_DELIVERY", label: "Customer Delivery", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
  ];

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Create Gate Pass</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Select vehicle — Initiator / Service Advisor will complete the details.
        </p>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-5">

        {/* Pass Type */}
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Pass Type</p>
          <div className="grid grid-cols-3 gap-2">
            {passTypeOptions.map(opt => {
              const active = passType === opt.value;
              return (
                <button key={opt.value} type="button"
                  onClick={() => handlePassTypeChange(opt.value)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all"
                  style={active
                    ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", borderColor: "#2563eb", color: "#fff" }
                    : { background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }
                  }>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} />
                  </svg>
                  <span className="text-xs font-bold leading-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gate Direction */}
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Gate Direction</p>
          <div className="grid grid-cols-2 gap-3">
            {(["OUT", "IN"] as Direction[]).map(dir => {
              const active = direction === dir;
              const isOut  = dir === "OUT";
              return (
                <button key={dir} type="button" onClick={() => setDirection(dir)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl border font-bold text-sm transition-all"
                  style={active
                    ? { background: isOut ? "linear-gradient(135deg,#1e1b4b,#3730a3)" : "linear-gradient(135deg,#042f2e,#0f766e)", borderColor: isOut ? "#818cf8" : "#2dd4bf", color: "#fff" }
                    : { background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }
                  }>
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isOut
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    }
                  </svg>
                  Gate {dir}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Vehicle Details + Assign To (single card) ── */}
        <div className="rounded-2xl border p-4 flex flex-col gap-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>

          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Vehicle Details</p>
            {passType === "AFTER_SALES" && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "#eff6ff", color: "#2563eb" }}>
                SAP · All vehicles
              </span>
            )}
          </div>

          {/* Unified vehicle search for ALL pass types */}
          <VehicleSearch
            passType={passType}
            selected={selectedVehicle}
            onSelect={v => setSelectedVehicle(v)}
            onClear={() => setSelectedVehicle(null)}
            showAddButton={passType === "AFTER_SALES"}
          />

          {/* Assign To */}
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Assign To — who should complete this form?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: "INITIATOR"       as AssignTo, label: "Initiator",       desc: "Gate Pass Initiator",     icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
                { value: "SERVICE_ADVISOR" as AssignTo, label: "Service Advisor", desc: "Service / Repair Advisor", icon: "M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" },
              ]).map(opt => {
                const active = assignTo === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setAssignTo(opt.value)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all"
                    style={active
                      ? { background: "linear-gradient(135deg,#064e3b,#065f46)", borderColor: "#34d399", color: "#fff" }
                      : { background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }
                    }>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} />
                    </svg>
                    <div className="text-left">
                      <p className="text-xs font-bold leading-tight">{opt.label}</p>
                      <p className="text-[10px] font-normal leading-tight opacity-70">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border"
          style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs" style={{ color: "#1d4ed8" }}>
            The assigned <strong>{assignTo === "INITIATOR" ? "Initiator" : "Service Advisor"}</strong> will be notified to complete this gate pass.
            It will appear in your Gate {direction} queue once completed and approved.
          </p>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2"
            style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" }}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {success}
          </motion.div>
        )}

        <button
          type="submit"
          disabled={submitting || !selectedVehicle || !!success}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
        >
          {submitting
            ? <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Creating…
              </span>
            : `Create Gate ${direction} Pass`
          }
        </button>
      </form>
    </div>
  );
}
