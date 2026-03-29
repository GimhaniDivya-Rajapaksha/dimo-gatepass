"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import DatePicker from "@/components/ui/DatePicker";
import TimePicker from "@/components/ui/TimePicker";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

type PassType = "LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "AFTER_SALES";
type LocationType = "DEALER" | "DIMO" | "PROMOTION" | "FINANCE";
type TransportMode = "CARRIER" | "DRIVER" | "CUSTOMER" | "OTHER";
type LookupField = "location" | "outReason" | "vehicle" | "approver" | "companyName" | "carrierRegNo";
type LookupOption = { id: string; value: string; label: string; [key: string]: string };
type LookupState = Record<LookupField, LookupOption[]>;

const sectionCard = "rounded-2xl border p-6 mb-5";

/* ─── Shared UI components ─────────────────────────────────────────── */
function Field({ children, label: lbl, required, error, className = "" }: {
  children: React.ReactNode; label: string; required?: boolean; error?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
        {lbl}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, error, onFocus, options, onSelect, renderOption, loading }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  onFocus?: () => void;
  options?: LookupOption[];
  onSelect?: (o: LookupOption) => void;
  renderOption?: (o: LookupOption) => React.ReactNode;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="relative">
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
          onFocus?.();
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 200);
        }}
        placeholder={placeholder}
        className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
        style={{ background: "var(--surface2)", borderColor: error ? "#f87171" : "var(--border)", color: "var(--text)" }}
      />
      {loading ? (
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : (
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )}
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-52 overflow-auto rounded-xl border shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {loading ? (
            <p className="px-3 py-2.5 text-sm flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading…
            </p>
          ) : options && options.length > 0 ? (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-500/10"
                style={{ color: "var(--text)" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onChange(o.value); onSelect?.(o); setOpen(false);
                }}
              >
                {renderOption ? renderOption(o) : o.label}
              </button>
            ))
          ) : (
            <p className="px-3 py-2.5 text-sm" style={{ color: "var(--text-muted)" }}>
              {value ? "No matches found" : "Type to search…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Location Picker (Promotion / Finance) ─────────────────────────── */
function TwoColumnLocationPicker({ value, displayValue, onSelect, locationType, error, onNewLocation }: {
  value: string; displayValue?: string;
  onSelect: (o: LookupOption) => void;
  locationType: "PROMOTION" | "FINANCE";
  error?: string;
  onNewLocation?: (o: LookupOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  // ADD form state
  const [addPlant, setAddPlant] = useState("");
  const [addLocation, setAddLocation] = useState("");
  const [plantDropOpen, setPlantDropOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch(`/api/lookups?field=location&locationType=${locationType}&limit=200`);
    const data: { options: LookupOption[] } = await res.json();
    setOptions(data.options ?? []);
  }
  useEffect(() => { void load(); }, [locationType]);

  // Unique plant names for the ADD form dropdown
  const plantNames = useMemo(() => {
    const seen = new Set<string>();
    options.forEach(o => seen.add(o.plantDescription));
    return [...seen].sort();
  }, [options]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setShowAdd(false); setPlantDropOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function handleAdd() {
    if (!addPlant.trim()) { setAddError("Plant name is required"); return; }
    if (!addLocation.trim()) { setAddError("Location name is required"); return; }
    setAdding(true); setAddError("");
    const res = await fetch("/api/lookups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "location", plantDescription: addPlant.trim(), storageDescription: addLocation.trim(), locationType }),
    });
    const data: { option?: LookupOption; error?: string } = await res.json();
    if (data.option) {
      setOptions(prev => [...prev, data.option!]);
      onNewLocation?.(data.option!);
      setAddPlant(""); setAddLocation(""); setShowAdd(false);
    } else { setAddError(data.error ?? "Failed to add"); }
    setAdding(false);
  }

  const typeLabel = locationType === "PROMOTION" ? "Promo Location" : "Finance Institution";
  const displayText = displayValue || value;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); void load(); }}
        className="w-full border rounded-xl px-4 py-2.5 text-sm text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
        style={{ background: "var(--surface2)", borderColor: error ? "#f87171" : "var(--border)", color: displayText ? "var(--text)" : "var(--text-muted)" }}
      >
        <span className="truncate">{displayText || `Select ${typeLabel}`}</span>
        <svg className="w-4 h-4 ml-2 flex-shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border shadow-xl overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)", minWidth: "320px" }}>

          {/* Column header + ADD */}
          <div className="flex items-center border-b px-3 py-2 gap-2" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
            <span className="flex-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Plant Name</span>
            <span className="w-32 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Location</span>
            <button type="button" onClick={() => { setShowAdd(s => !s); setAddError(""); setAddPlant(""); setAddLocation(""); setPlantDropOpen(false); }}
              className="text-xs px-3 py-1 rounded-lg text-white font-bold" style={{ background: "#16a34a" }}>
              ADD
            </button>
          </div>

          {/* ADD inline form */}
          {showAdd && (
            <div className="border-b px-3 py-3 space-y-2" style={{ borderColor: "var(--border)", background: "#f0fdf4" }}>
              {/* Plant selector */}
              <div className="relative">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <button
                      type="button"
                      onClick={() => setPlantDropOpen(p => !p)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-green-300"
                      style={{ borderColor: addError && !addPlant ? "#f87171" : "var(--border)", background: "var(--surface)", color: addPlant ? "var(--text)" : "var(--text-muted)" }}
                    >
                      <span className="truncate">{addPlant || "Select or type plant name…"}</span>
                      <svg className="w-3 h-3 ml-1 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {plantDropOpen && (
                      <div className="absolute z-40 mt-0.5 w-full rounded-lg border shadow-lg max-h-36 overflow-auto"
                        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                        {/* Type new plant name */}
                        <div className="px-2 pt-2 pb-1">
                          <input
                            autoFocus type="text"
                            value={addPlant}
                            onChange={e => setAddPlant(e.target.value)}
                            placeholder="Type new plant name…"
                            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-300"
                            style={{ borderColor: "var(--border)", background: "var(--surface2)", color: "var(--text)" }}
                          />
                        </div>
                        {plantNames.map(p => (
                          <button key={p} type="button"
                            onClick={() => { setAddPlant(p); setPlantDropOpen(false); }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-500/10 border-t transition-colors"
                            style={{ borderColor: "var(--border)", color: "var(--text)" }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Location name input */}
              <input
                type="text" value={addLocation}
                onChange={e => { setAddLocation(e.target.value); setAddError(""); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
                placeholder="Location name…"
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                style={{ borderColor: addError && !addLocation ? "#f87171" : "var(--border)", background: "var(--surface)", color: "var(--text)" }}
              />
              {addError && <p className="text-red-500 text-xs">{addError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => void handleAdd()} disabled={adding}
                  className="px-4 py-1.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: "#16a34a" }}>
                  {adding ? "…" : "Save"}
                </button>
                <button type="button" onClick={() => { setShowAdd(false); setAddPlant(""); setAddLocation(""); setAddError(""); }}
                  className="px-4 py-1.5 rounded-lg text-sm border"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Rows — hide generic placeholder entries */}
          <div className="max-h-52 overflow-auto">
            {options.filter(o => o.storageDescription !== "Finan Institute" && o.storageDescription !== "Promo Location")
              .length === 0 ? (
              <p className="text-center text-sm py-4" style={{ color: "var(--text-muted)" }}>No options — click ADD to create one</p>
            ) : options
                .filter(o => o.storageDescription !== "Finan Institute" && o.storageDescription !== "Promo Location")
                .map(o => (
              <button key={o.id} type="button"
                onClick={() => { onSelect(o); setOpen(false); setShowAdd(false); }}
                className="w-full flex items-center px-3 py-2.5 text-sm border-b last:border-0 hover:bg-blue-500/10 transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--text)", background: displayText === o.storageDescription ? "rgba(37,99,235,0.08)" : undefined }}
              >
                <span className="flex-1 font-medium text-left truncate">{o.plantDescription}</span>
                <span className="w-32 text-right text-xs flex-shrink-0 pr-1" style={{ color: "var(--text-muted)" }}>{o.storageDescription}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, error, type = "text", numericOnly = false, nicOnly = false, maxLength, min }: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: string; type?: string;
  numericOnly?: boolean; nicOnly?: boolean; maxLength?: number; min?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (numericOnly) v = v.replace(/\D/g, "");
    if (nicOnly)     v = v.replace(/[^0-9vVxX]/g, "").toUpperCase();
    if (maxLength)   v = v.slice(0, maxLength);
    onChange(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const nav = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab"];
    if (numericOnly && !/\d/.test(e.key) && !nav.includes(e.key)) e.preventDefault();
    if (nicOnly && !/[\dvVxX]/.test(e.key) && !nav.includes(e.key))  e.preventDefault();
  };

  return (
    <div className="relative">
      <input
        type={numericOnly ? "tel" : type}
        value={value}
        onChange={handleChange}
        onKeyDown={(numericOnly || nicOnly) ? handleKeyDown : undefined}
        placeholder={placeholder}
        inputMode={numericOnly ? "numeric" : undefined}
        maxLength={maxLength}
        min={min}
        className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
        style={{ background: "var(--surface2)", borderColor: error ? "#f87171" : "var(--border)", color: "var(--text)" }}
      />
      {maxLength && value.length > 0 && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium tabular-nums pointer-events-none"
          style={{ color: value.length === maxLength ? "#ef4444" : "var(--text-muted)" }}
        >
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold mb-5" style={{ color: "var(--accent)" }}>{children}</h2>;
}

/* ─── Add Vehicle Modal ─────────────────────────────────────────────── */
const VEHICLE_MAKES = [
  "Toyota","Mitsubishi","Honda","Nissan","Suzuki","Hyundai","KIA","Isuzu",
  "Ford","Mazda","Subaru","Land Rover","Jeep","BMW","Mercedes-Benz","Audi",
  "Volkswagen","Tata","Ashok Leyland","Bajaj","Other",
];

const COLOUR_FAMILIES = [
  "White","Black","Silver","Grey","Red","Blue","Green",
  "Yellow","Orange","Brown","Beige","Purple","Gold","Maroon","Navy",
];

function AddVehicleModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (opt: LookupOption) => void;
}) {
  const [vehicleNo,    setVehicleNo]    = useState("");
  const [chassisNo,    setChassisNo]    = useState("");
  const [model,        setModel]        = useState("");
  const [make,         setMake]         = useState("");
  const [colourFamily, setColourFamily] = useState("");
  const [colourSearch, setColourSearch] = useState("");
  const [colourOpen,   setColourOpen]   = useState(false);
  const [colour,       setColour]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [errors,       setErrors]       = useState<Record<string, string>>({});

  const filteredColours = COLOUR_FAMILIES.filter((c) =>
    c.toLowerCase().includes(colourSearch.toLowerCase())
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!vehicleNo.trim())    e.vehicleNo    = "Vehicle number is required";
    if (!model.trim())        e.model        = "Vehicle model is required";
    if (!make)                e.make         = "Vehicle make is required";
    if (!colourFamily)        e.colourFamily = "Colour family is required";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    setErrors({});
    try {
      const res = await fetch("/api/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: "vehicle",
          vehicleNo: vehicleNo.trim(),
          chassisNo: chassisNo.trim(),
          model: model.trim(),
          make,
          colourFamily,
          colour: colour.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onAdd(data.option);
      onClose();
    } catch {
      setErrors({ submit: "Failed to add vehicle. Try again." });
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (err?: string) => ({
    background: "var(--surface2)",
    borderColor: err ? "#ef4444" : "var(--border)",
    color: "var(--text)",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl mx-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Add New Vehicle</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {errors.submit && <p className="text-red-500 text-xs mb-3">{errors.submit}</p>}

        <div className="space-y-4">
          {/* Vehicle Number + Chassis Number (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehicle Number" required error={errors.vehicleNo}>
              <input
                value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. CAB-1234"
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                style={inputStyle(errors.vehicleNo)}
              />
            </Field>
            <Field label="Chassis Number" error={errors.chassisNo}>
              <input
                value={chassisNo} onChange={(e) => setChassisNo(e.target.value)}
                placeholder="e.g. LC1234567890"
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                style={inputStyle(errors.chassisNo)}
              />
            </Field>
          </div>

          {/* Vehicle Model */}
          <Field label="Vehicle Model" required error={errors.model}>
            <input
              value={model} onChange={(e) => setModel(e.target.value)}
              placeholder="Enter vehicle model"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
              style={inputStyle(errors.model)}
            />
          </Field>

          {/* Vehicle Make — dropdown */}
          <Field label="Vehicle Make" required error={errors.make}>
            <div className="relative">
              <select
                value={make} onChange={(e) => setMake(e.target.value)}
                className="w-full appearance-none border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all pr-10"
                style={inputStyle(errors.make)}
              >
                <option value="">Enter vehicle make</option>
                {VEHICLE_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </Field>

          {/* Colour Family — searchable dropdown */}
          <Field label="Colour Family" required error={errors.colourFamily}>
            <div className="relative">
              <input
                value={colourFamily ? colourFamily : colourSearch}
                onChange={(e) => { setColourSearch(e.target.value); setColourFamily(""); setColourOpen(true); }}
                onFocus={() => setColourOpen(true)}
                onBlur={() => setTimeout(() => setColourOpen(false), 150)}
                placeholder="Select vehicle colour"
                className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                style={inputStyle(errors.colourFamily)}
              />
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {colourOpen && filteredColours.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-44 overflow-auto rounded-xl border shadow-lg"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  {filteredColours.map((c) => (
                    <button key={c} type="button"
                      className="w-full text-left px-4 py-2 text-sm hover:bg-blue-500/10 flex items-center gap-2.5"
                      style={{ color: "var(--text)" }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setColourFamily(c); setColourSearch(""); setColourOpen(false); setErrors((p) => ({ ...p, colourFamily: "" })); }}
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                        style={{ background: c.toLowerCase() === "silver" ? "#c0c0c0" : c.toLowerCase() === "navy" ? "#001f5b" : c.toLowerCase() === "maroon" ? "#800000" : c.toLowerCase() === "beige" ? "#f5f0dc" : c.toLowerCase() === "gold" ? "#FFD700" : c.toLowerCase() }} />
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Vehicle Colour */}
          <Field label="Vehicle Colour">
            <input
              value={colour} onChange={(e) => setColour(e.target.value)}
              placeholder="Enter vehicle colour"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
              style={inputStyle()}
            />
          </Field>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
            style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface2)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-70"
            style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}
          >
            {loading ? "Adding..." : "Add"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────── */
export default function CreateGatePassPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [passType, setPassType] = useState<PassType>("LOCATION_TRANSFER");
  const [locationType, setLocationType] = useState<LocationType | "">("");
  const [transportMode, setTransportMode] = useState<TransportMode>("CARRIER");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [addVehicleTarget, setAddVehicleTarget] = useState<"lt" | "cd" | "sr">("lt");
  const [assignedApprover, setAssignedApprover] = useState<{ id: string; name: string } | null>(null);
  const [selectedLocationDetail, setSelectedLocationDetail] = useState<{
    plantCode: string; plantDescription: string; storageLocation: string; storageDescription: string;
  } | null>(null);
  const [selectedVehicleDetail, setSelectedVehicleDetail] = useState<{
    chassisNo: string; model: string; make: string; colourFamily: string; colour: string;
    currentLocation?: string;
  } | null>(null);
  const [selectedCdVehicleDetail, setSelectedCdVehicleDetail] = useState<{
    vehicleNo: string; chassisNo: string; model: string; make: string; colourFamily: string; colour: string;
  } | null>(null);
  const [selectedSrVehicleDetail, setSelectedSrVehicleDetail] = useState<{
    vehicleNo: string; chassisNo: string; model: string; make: string; colourFamily: string; colour: string;
  } | null>(null);

  const [lookupOptions, setLookupOptions] = useState<LookupState>({
    location: [], outReason: [], vehicle: [],
    approver: [], companyName: [], carrierRegNo: [],
  });
  const [locationLoading, setLocationLoading] = useState(false);

  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD" for min date constraint

  // Location Transfer / After Sales fields (shared structure)
  const [lt, setLt] = useState({
    toLocation: "", fromLocation: "", outReason: "", vehicle: "",
    approver: "", departureDate: "", departureTime: "", reasonToOut: "",
    arrivalDate: "", arrivalTime: "",
    companyName: "", carrierRegNo: "", driverNIC: "", driverName: "",
    contactNo: "", mileage: "", insurance: "", garagePlate: "",
  });

  // Customer Delivery fields
  const [cd, setCd] = useState({
    approver: "", vehicle: "", departureDate: "", departureTime: "",
    companyName: "", carrierRegNo: "", driverNIC: "", driverName: "",
    contactNo: "", mileage: "", insurance: "", garagePlate: "",
  });

  // Service/Repair fields
  const [sr, setSr] = useState({
    approver: "", approver2: "", vehicle: "",
    onBy: "", jobType: "", serviceDate: "", serviceJobNo: "",
    customerName: "", customerContact: "",
    receivingLocation: "", arrivalDate: "", arrivalTime: "",
    companyName: "", carrierRegNo: "", driverNIC: "", driverName: "",
    contactNo: "", mileage: "", insurance: "", garagePlate: "",
  });
  const [srVehicleTab, setSrVehicleTab] = useState<"add" | "general">("add");
  const [showSrBulkUpload, setShowSrBulkUpload] = useState(false);
  const [srParts, setSrParts] = useState<{ id: string; partName: string; partId: string }[]>([]);
  const [showAddPart, setShowAddPart] = useState(false);
  const [editPartId, setEditPartId] = useState<string | null>(null);
  const [partNameInput, setPartNameInput] = useState("");
  const [partIdInput, setPartIdInput] = useState("");
  const [showAddCarrier, setShowAddCarrier] = useState(false);
  const [newCarrierName, setNewCarrierName] = useState("");
  const [newCarrierReg, setNewCarrierReg] = useState("");

  // After Sales (within SR tab) state
  const [srMode, setSrMode] = useState<"in" | "out">("in");
  const [asVehicleSearch, setAsVehicleSearch] = useState("");
  const [asVehiclePasses, setAsVehiclePasses] = useState<any[]>([]);
  const [asVehicleLoading, setAsVehicleLoading] = useState(false);
  const [asGateInSearch, setAsGateInSearch] = useState("");
  const [asFoundPass, setAsFoundPass] = useState<any | null>(null);
  const [asGateInLoading, setAsGateInLoading] = useState(false);
  const [asSubType, setAsSubType] = useState<"SUB_OUT" | "SUB_IN" | "MAIN_OUT" | "SUB_OUT_IN">("SUB_OUT");

  const [asToLocation, setAsToLocation] = useState("");
  const [asFromLocation, setAsFromLocation] = useState("");
  const [dimoLocations, setDimoLocations] = useState<LookupOption[]>([]);
  const [mainOutApprover, setMainOutApprover] = useState("");
  // SAP pre-fetch for MAIN_OUT — determines if approver selection is needed
  type SapPreviewOrder = { orderId: string; orderStatus: string; payTerm: string; orderStatusCode?: string; billingType?: string; billingDate?: string };
  const [sapPreviewOrders, setSapPreviewOrders] = useState<SapPreviewOrder[]>([]);
  const [sapPreviewLoading, setSapPreviewLoading] = useState(false);
  // SAP invoice check for Customer Delivery
  const [cdSapOrders, setCdSapOrders] = useState<SapPreviewOrder[]>([]);
  const [cdSapLoading, setCdSapLoading] = useState(false);
  const [cdSapLoaded, setCdSapLoaded] = useState(false);

  useEffect(() => {
    const allowed = ["INITIATOR", "AREA_SALES_OFFICER", "SERVICE_ADVISOR"];
    if (status === "authenticated" && !allowed.includes(session?.user?.role ?? "")) router.replace("/");
  }, [status, session, router]);

  // For ASO: auto-select After Sales tab and force srMode to "out"
  useEffect(() => {
    if (session?.user?.role === "AREA_SALES_OFFICER") {
      setPassType("AFTER_SALES");
      setSrMode("out");
    }
  }, [session?.user?.role]);

  // Keep srMode="out" for ASO even if passType gets reset
  useEffect(() => {
    if (session?.user?.role === "AREA_SALES_OFFICER") setSrMode("out");
  }, [session?.user?.role, passType]);


  // Auto-fetch the initiator's assigned approver
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/me")
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.user?.approver) {
            setAssignedApprover(d.user.approver);
            setLt(p => ({ ...p, approver: d.user.approver.name }));
            setCd(p => ({ ...p, approver: d.user.approver.name }));
            setSr(p => ({ ...p, approver: d.user.approver.name }));
          }
        })
        .catch(() => {});
    }
  }, [status]);

  const fetchLookup = async (field: LookupField, q = "", lt_type?: string) => {
    if (field === "location") setLocationLoading(true);
    try {
      // Use higher limit for locations so full lists appear without typing
      const limit = field === "location" ? "300" : "40";
      const params = new URLSearchParams({ field, q, limit });
      if (field === "location" && lt_type) params.set("locationType", lt_type);
      // Tell the vehicle lookup which SAP API to query based on current pass type
      if (field === "vehicle" && passType && passType !== "AFTER_SALES") {
        params.set("passType", passType);
      }
      const res = await fetch(`/api/lookups?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { options?: LookupOption[] };
      setLookupOptions((prev) => ({ ...prev, [field]: data.options ?? [] }));
    } catch {
      // silently keep existing options
    } finally {
      if (field === "location") setLocationLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      void fetchLookup("location", "", locationType || undefined);
      void fetchLookup("outReason");
      void fetchLookup("vehicle");
      void fetchLookup("approver");
      void fetchLookup("companyName");
      void fetchLookup("carrierRegNo");
      // Fetch DIMO locations for SR OUT "From Location" dropdown
      fetch("/api/lookups?field=location&locationType=DIMO&limit=200")
        .then(r => r.ok ? r.json() : null)
        .then((d: { options?: LookupOption[] } | null) => { if (d?.options) setDimoLocations(d.options); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, locationType]);

  // Fetch SAP invoice data when a CD vehicle is selected
  useEffect(() => {
    if (passType !== "CUSTOMER_DELIVERY" || !selectedCdVehicleDetail) {
      setCdSapOrders([]); setCdSapLoaded(false); return;
    }
    const chassis = selectedCdVehicleDetail.chassisNo ?? "";
    const plate   = selectedCdVehicleDetail.vehicleNo ?? "";
    if (!chassis && !plate) return;
    setCdSapLoading(true); setCdSapLoaded(false);
    fetch(`/api/sap/orders?vin=${encodeURIComponent(chassis)}&licplate=${encodeURIComponent(plate)}`)
      .then(r => r.ok ? r.json() : { orders: [] })
      .then((d: { orders?: SapPreviewOrder[] }) => { setCdSapOrders(d.orders ?? []); setCdSapLoaded(true); })
      .catch(() => { setCdSapOrders([]); setCdSapLoaded(true); })
      .finally(() => setCdSapLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passType, selectedCdVehicleDetail]);

  // Pre-fetch SAP orders when MAIN_OUT is selected and a vehicle is linked
  useEffect(() => {
    if (asSubType !== "MAIN_OUT" || !asFoundPass) {
      setSapPreviewOrders([]);
      setMainOutApprover("");
      return;
    }
    const chassis = asFoundPass.chassis ?? "";
    const plate   = asFoundPass.vehicle ?? "";
    if (!chassis && !plate) return;
    setSapPreviewLoading(true);
    fetch(`/api/sap/orders?vin=${encodeURIComponent(chassis)}&licplate=${encodeURIComponent(plate)}`)
      .then(r => r.ok ? r.json() : { orders: [] })
      .then((d: { orders?: SapPreviewOrder[] }) => setSapPreviewOrders(d.orders ?? []))
      .catch(() => setSapPreviewOrders([]))
      .finally(() => setSapPreviewLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asSubType, asFoundPass]);

  if (status === "loading") return null;

  const setL = (k: keyof typeof lt, v: string) => {
    setLt((p) => ({ ...p, [k]: v }));
    setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  const setC = (k: keyof typeof cd, v: string) => {
    setCd((p) => ({ ...p, [k]: v }));
    setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  const setS = (k: keyof typeof sr, v: string) => {
    setSr((p) => ({ ...p, [k]: v }));
    setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  const isLtLike = passType === "LOCATION_TRANSFER";
  const isSr = passType === "AFTER_SALES";

  // Determine vehicle's current location from most recent completed gate pass
  const fetchVehicleCurrentLocation = async (vehicleNo: string): Promise<string | undefined> => {
    if (!vehicleNo.trim()) return undefined;
    try {
      const res = await fetch(`/api/gate-pass/by-vehicle?vehicleNo=${encodeURIComponent(vehicleNo)}`);
      const d = await res.json();
      const passes: { status: string; toLocation: string | null }[] = d.passes ?? [];
      // Most recent COMPLETED → vehicle arrived at toLocation
      const completed = passes.find((p) => p.status === "COMPLETED" && p.toLocation);
      if (completed?.toLocation) return completed.toLocation;
      // Fall back to user's default location
      return session?.user?.defaultLocation ?? undefined;
    } catch {
      return session?.user?.defaultLocation ?? undefined;
    }
  };

  const searchVehiclePasses = async (vehicleNo: string) => {
    if (!vehicleNo.trim()) { setAsVehiclePasses([]); return; }
    setAsVehicleLoading(true);
    try {
      const res = await fetch(`/api/gate-pass/by-vehicle?vehicleNo=${encodeURIComponent(vehicleNo)}`);
      const d = await res.json();
      setAsVehiclePasses(d.passes || []);
    } catch {
      setAsVehiclePasses([]);
    } finally { setAsVehicleLoading(false); }
  };

  const searchGateInPass = async (gpNumber: string) => {
    if (!gpNumber.trim()) { setAsFoundPass(null); return; }
    setAsGateInLoading(true);
    try {
      const normalize = (s: string) => s.trim().toUpperCase().replace(/^GP-0*(\d+)$/, (_, n) => `GP-${n.padStart(4, "0")}`);
      const normalizedInput = normalize(gpNumber);

      // Step 1: search any AFTER_SALES pass (no parentOnly restriction)
      const res = await fetch(`/api/gate-pass?search=${encodeURIComponent(normalizedInput)}&limit=10&passType=AFTER_SALES`);
      if (!res.ok) return;
      const d = await res.json();
      let candidate = (d.passes ?? []).find((p: any) => p.gatePassNumber === normalizedInput);

      // Step 2: if it's a sub-pass, resolve to its MAIN_IN parent
      if (candidate?.parentPass?.gatePassNumber) {
        const parentNo = candidate.parentPass.gatePassNumber;
        const parentRes = await fetch(`/api/gate-pass?search=${encodeURIComponent(parentNo)}&limit=5&passType=AFTER_SALES&parentOnly=true`);
        if (parentRes.ok) {
          const pd = await parentRes.json();
          const parent = pd.passes?.find((p: any) => p.gatePassNumber === parentNo);
          if (parent) candidate = parent;
        }
      }

      // Step 3: only accept MAIN_IN or SUB_IN as the "root" gate-in pass
      const found = candidate && (candidate.passSubType === "MAIN_IN" || candidate.passSubType === "SUB_IN") ? candidate : null;

      setAsFoundPass(found || null);
      setAsToLocation("");
      if (found?.toLocation) setAsFromLocation(found.toLocation);
      else setAsFromLocation("");

      if (found) {
        const subs = found.subPasses ?? [];
        const sorted = [...subs].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const lastAnySub = sorted[0];
        if (lastAnySub?.passSubType === "SUB_OUT" && lastAnySub?.status === "COMPLETED") setAsSubType("SUB_IN");
        else setAsSubType("SUB_OUT");
      }
    } finally { setAsGateInLoading(false); }
  };

  const setCarrier = (k: string, v: string) => {
    if (isLtLike) setL(k as keyof typeof lt, v);
    else if (isSr) setS(k as keyof typeof sr, v);
    else setC(k as keyof typeof cd, v);
  };

  const setMileage = (k: string, v: string) => {
    if (isLtLike) setL(k as keyof typeof lt, v);
    else if (isSr) setS(k as keyof typeof sr, v);
    else setC(k as keyof typeof cd, v);
  };

  const validate = () => {
    const e: Record<string, string> = {};

    // Helpers
    const validNIC = (v: string) => /^[0-9]{9}[VvXx]$/.test(v.trim()) || /^[0-9]{12}$/.test(v.trim());
    const validPhone = (v: string) => /^[0-9+\-\s]{7,15}$/.test(v.trim());
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const parseDate = (d: string) => { const dt = new Date(d); dt.setHours(0, 0, 0, 0); return dt; };
    // Returns true if date+time is in the past (both must be provided)
    const isPastDateTime = (date: string, time: string) => {
      if (!date || !time) return false;
      const [h, m] = time.split(":").map(Number);
      const dt = new Date(date);
      dt.setHours(h, m, 0, 0);
      return dt < now;
    };

    if (isLtLike) {
      if (!lt.toLocation) e.toLocation = "Destination location is required";
      if (!lt.outReason) e.outReason = "Reason for going out is required";
      if (!lt.vehicle) e.vehicle = "Vehicle is required";
      if (!lt.approver) e.approver = "Approver is required";
      if (!lt.departureDate) e.departureDate = "Departure date is required";
      else if (parseDate(lt.departureDate) < today) e.departureDate = "Departure date cannot be in the past";
      if (!lt.departureTime) e.departureTime = "Departure time is required";
      else if (!e.departureDate && isPastDateTime(lt.departureDate, lt.departureTime)) e.departureTime = "Departure time cannot be in the past";
    } else if (isSr && srMode === "out") {
      if (!asFoundPass) e.asGateIn = "Please find a valid Gate IN pass first";
      if (!asToLocation && !["MAIN_OUT"].includes(asSubType)) e.asToLocation = "Destination location is required";
      if (!asFromLocation && !["MAIN_OUT"].includes(asSubType)) e.asFromLocation = "Origin location is required";
      if (asSubType === "MAIN_OUT" && !mainOutApprover && sapPreviewOrders.some(o => { const t = (o.payTerm || "").toLowerCase().trim(); return t !== "" && !["immediate","zc01","payment immediate","cash","pay immediately w/o deduction"].includes(t); })) e.mainOutApprover = "Select an approver for credit orders";
      if (!cd.departureDate) e.departureDate = "Departure date is required";
      else if (parseDate(cd.departureDate) < today) e.departureDate = "Departure date cannot be in the past";
      if (!cd.departureTime) e.departureTime = "Departure time is required";
      else if (!e.departureDate && isPastDateTime(cd.departureDate, cd.departureTime)) e.departureTime = "Departure time cannot be in the past";
      // Note: Transport Details section is hidden for After Sales out — no carrier validation needed here
    } else if (isSr) {
      if (!sr.vehicle) e.vehicle = "Vehicle is required";
      if (!sr.approver) e.approver = "Approver is required";
      if (!sr.jobType) e.jobType = "Job type is required";
      if (!sr.receivingLocation) e.receivingLocation = "Receiving location is required";
      if (!sr.arrivalDate) e.arrivalDate = "Arrival date is required";
      else if (parseDate(sr.arrivalDate) < today) e.arrivalDate = "Arrival date cannot be in the past";
      if (!sr.arrivalTime) e.arrivalTime = "Arrival time is required";
      else if (!e.arrivalDate && isPastDateTime(sr.arrivalDate, sr.arrivalTime)) e.arrivalTime = "Arrival time cannot be in the past";
    } else {
      if (!cd.vehicle) e.vehicle = "Vehicle is required";
      if (!cd.departureDate) e.departureDate = "Departure date is required";
      else if (parseDate(cd.departureDate) < today) e.departureDate = "Departure date cannot be in the past";
      if (!cd.departureTime) e.departureTime = "Departure time is required";
      else if (!e.departureDate && isPastDateTime(cd.departureDate, cd.departureTime)) e.departureTime = "Departure time cannot be in the past";
    }

    // Carrier validation (non-After-Sales-out)
    if (transportMode === "CARRIER" && !(isSr && srMode === "out")) {
      const src = isLtLike ? lt : isSr ? sr : cd;
      if (!src.companyName) e.companyName = "Carrier company name is required";
      if (!src.driverNIC) e.driverNIC = "Driver NIC is required";
      else if (!validNIC(src.driverNIC)) e.driverNIC = "Invalid NIC format (e.g. 123456789V or 200012345678)";
      if (!src.driverName) e.driverName = "Driver name is required";
      if (src.contactNo && !validPhone(src.contactNo)) e.contactNo = "Invalid contact number format";
    }

    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      console.log("[Submit blocked] Validation errors:", errs);
      // Scroll to first error field
      const firstKey = Object.keys(errs)[0];
      document.querySelector(`[name="${firstKey}"], [data-field="${firstKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setLoading(true);

    const ltCarrierMileage = { companyName: lt.companyName, carrierRegNo: lt.carrierRegNo, driverName: lt.driverName, driverNIC: lt.driverNIC, driverContact: lt.contactNo, mileage: lt.mileage, insurance: lt.insurance, garagePlate: lt.garagePlate };
    const cdCarrierMileage = { companyName: cd.companyName, carrierRegNo: cd.carrierRegNo, driverName: cd.driverName, driverNIC: cd.driverNIC, driverContact: cd.contactNo, mileage: cd.mileage, insurance: cd.insurance, garagePlate: cd.garagePlate };
    const srCarrierMileage = { companyName: sr.companyName, carrierRegNo: sr.carrierRegNo, driverName: sr.driverName, driverNIC: sr.driverNIC, driverContact: sr.contactNo, mileage: sr.mileage, insurance: sr.insurance, garagePlate: sr.garagePlate };

    // After Sales gate-out pass
    if (isSr && srMode === "out") {
      const asPayload = {
        passType: "AFTER_SALES",
        passSubType: asSubType,

        parentPassId: asFoundPass?.parentPassId || asFoundPass?.id || null,
        vehicle: asFoundPass?.vehicle,
        chassis: asFoundPass?.chassis,
        make: asFoundPass?.make,
        vehicleColor: asFoundPass?.vehicleColor,
        serviceJobNo: asFoundPass?.serviceJobNo ?? null,
        toLocation: asToLocation,
        fromLocation: asFromLocation || null,
        approver: asSubType === "MAIN_OUT" ? mainOutApprover || null : (asFoundPass?.approver || sr.approver || null),
        departureDate: cd.departureDate,
        departureTime: cd.departureTime,
        transportMode,
        ...srCarrierMileage,
      };
      try {
        const res = await fetch("/api/gate-pass", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(asPayload),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
        setSubmitted(true);
        setTimeout(() => router.push("/gate-pass"), 2500);
      } catch (err) {
        setLoading(false);
        setErrors({ form: String(err) });
      }
      return;
    }

    const payload = isLtLike
      ? {
          passType,
          vehicle: lt.vehicle,
          chassis: selectedVehicleDetail?.chassisNo || null,
          make: selectedVehicleDetail?.make || null,
          vehicleColor: selectedVehicleDetail?.colour || null,
          toLocation: lt.toLocation,
          fromLocation: lt.fromLocation || null,
          outReason: lt.outReason,
          approver: lt.approver,
          departureDate: lt.departureDate,
          departureTime: lt.departureTime,
          arrivalDate: lt.arrivalDate || null,
          arrivalTime: lt.arrivalTime || null,
          transportMode,
          ...ltCarrierMileage,
        }
      : isSr
      ? {
          passType: "AFTER_SALES",
          passSubType: "MAIN_IN",
          vehicle: sr.vehicle,
          chassis: selectedSrVehicleDetail?.chassisNo || null,
          make: selectedSrVehicleDetail?.make || null,
          vehicleColor: selectedSrVehicleDetail?.colour || null,
          requestedBy: sr.customerName || null,
          approver: sr.approver,
          outReason: sr.jobType,
          toLocation: sr.receivingLocation,
          arrivalDate: sr.arrivalDate || null,
          arrivalTime: sr.arrivalTime || null,
          departureDate: sr.serviceDate || sr.arrivalDate || null,
          departureTime: sr.arrivalTime || null,
          serviceJobNo: sr.serviceJobNo || null,
          transportMode,
          comments: srParts.length > 0 ? JSON.stringify(srParts.map(p => `${p.partName} (${p.partId})`)) : null,
          ...srCarrierMileage,
        }
      : {
          passType: "CUSTOMER_DELIVERY",
          vehicle: cd.vehicle,
          chassis: selectedCdVehicleDetail?.chassisNo || null,
          make: selectedCdVehicleDetail?.make || null,
          vehicleColor: selectedCdVehicleDetail?.colour || null,
          approver: cd.approver,
          departureDate: cd.departureDate,
          departureTime: cd.departureTime,
          transportMode,
          isInvoiced: cdSapOrders.some(o => (o as any).orderStatusCode === "H070"),
          ...cdCarrierMileage,
        };

    try {
      const res = await fetch("/api/gate-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      setSubmitted(true);
      setTimeout(() => router.push("/gate-pass"), 2500);
    } catch (err) {
      setLoading(false);
      setErrors({ form: String(err) });
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="text-center p-10 rounded-3xl border shadow-xl"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>Gate Pass Created!</h2>
          <p style={{ color: "var(--text-muted)" }}>Redirecting to Gate Pass List...</p>
        </motion.div>
      </div>
    );
  }

  const transportModes = (isLtLike || isSr)
    ? (["CARRIER", "OTHER"] as TransportMode[])
    : (["CARRIER", "DRIVER", "CUSTOMER"] as TransportMode[]);

  const modeLabel: Record<TransportMode, string> = {
    CARRIER: "Carrier", DRIVER: "Driver", CUSTOMER: "Customer", OTHER: "Other",
  };

  const carrierFields = isLtLike
    ? { companyName: lt.companyName, carrierRegNo: lt.carrierRegNo, driverNIC: lt.driverNIC, driverName: lt.driverName, contactNo: lt.contactNo }
    : isSr
    ? { companyName: sr.companyName, carrierRegNo: sr.carrierRegNo, driverNIC: sr.driverNIC, driverName: sr.driverName, contactNo: sr.contactNo }
    : { companyName: cd.companyName, carrierRegNo: cd.carrierRegNo, driverNIC: cd.driverNIC, driverName: cd.driverName, contactNo: cd.contactNo };

  const mileageFields = isLtLike
    ? { mileage: lt.mileage, insurance: lt.insurance, garagePlate: lt.garagePlate }
    : isSr
    ? { mileage: sr.mileage, insurance: sr.insurance, garagePlate: sr.garagePlate }
    : { mileage: cd.mileage, insurance: cd.insurance, garagePlate: cd.garagePlate };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {/* Modals */}
      <AnimatePresence>
        {showAddVehicle && (
          <AddVehicleModal
            onClose={() => setShowAddVehicle(false)}
            onAdd={(opt) => {
              if (addVehicleTarget === "cd") {
                setC("vehicle", opt.value);
                setSelectedCdVehicleDetail({ vehicleNo: opt.value, chassisNo: opt.chassisNo ?? "", model: opt.model ?? "", make: opt.make ?? "", colourFamily: opt.colourFamily ?? "", colour: opt.colour ?? "" });
                setErrors((p) => { const n = { ...p }; delete n.vehicle; return n; });
              } else if (addVehicleTarget === "sr") {
                setS("vehicle", opt.value);
                setSelectedSrVehicleDetail({ vehicleNo: opt.value, chassisNo: opt.chassisNo ?? "", model: opt.model ?? "", make: opt.make ?? "", colourFamily: opt.colourFamily ?? "", colour: opt.colour ?? "" });
                setErrors((p) => { const n = { ...p }; delete n.vehicle; return n; });
              } else {
                setL("vehicle", opt.value);
                setSelectedVehicleDetail({
                  chassisNo:    opt.chassisNo    ?? "",
                  model:        opt.model        ?? "",
                  make:         opt.make         ?? "",
                  colourFamily: opt.colourFamily ?? "",
                  colour:       opt.colour       ?? "",
                });
                void fetchLookup("vehicle", opt.value);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          <span className="font-normal">Create</span> Gate Pass
        </h1>
      </div>

      {/* Type Toggle — hidden for ASO (always After Sales) */}
      <div className={`flex flex-wrap gap-3 mb-6 ${session?.user?.role === "AREA_SALES_OFFICER" ? "hidden" : ""}`}>
        {([
          { type: "LOCATION_TRANSFER", label: "Location Transfer", icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )},
          { type: "CUSTOMER_DELIVERY", label: "Customer Delivery", icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          )},
          { type: "AFTER_SALES", label: "Service/Repair", icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )},
        ] as { type: PassType; label: string; icon: React.ReactNode }[]).map(({ type: t, label, icon }) => (
          <motion.button
            key={t}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { setPassType(t); setErrors({}); setTransportMode("CARRIER"); setCd(p => ({ ...p, vehicle: "" })); setSelectedCdVehicleDetail(null); setSr(p => ({ ...p, vehicle: "" })); setSelectedSrVehicleDetail(null); setLocationType(""); setSrMode("in"); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all"
            style={passType === t
              ? { background: "linear-gradient(135deg, #1a4f9e, #2563eb)", color: "#fff", border: "none" }
              : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
            }
          >
            {icon}
            {label}
          </motion.button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <AnimatePresence mode="wait">
          {isSr ? (
            <motion.div key="sr" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>

              {/* SR Mode toggle — AREA_SALES_OFFICER only sees "Vehicle Move" (out) */}
              <div className={`gap-3 mb-5 ${session?.user?.role === "AREA_SALES_OFFICER" ? "hidden" : "grid grid-cols-2"}`}>
                {([
                  {
                    value: "in" as const,
                    label: "Create After Sales Gate Pass",
                    desc: "Vehicle arriving for service or repair",
                    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>,
                  },
                  {
                    value: "out" as const,
                    label: "Vehicle Move",
                    desc: "Vehicle going out or moving between plants",
                    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
                  },
                ]).map(({ value: v, label, desc, icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setSrMode(v); setErrors({}); setAsFoundPass(null); setAsVehiclePasses([]); setAsGateInSearch(""); setAsVehicleSearch(""); }}
                    className="rounded-2xl border-2 p-4 text-left transition-all"
                    style={{
                      borderColor: srMode === v ? "#2563eb" : "var(--border)",
                      background: srMode === v ? "linear-gradient(135deg,#eff6ff,#dbeafe)" : "var(--surface)",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: srMode === v ? "#2563eb" : "var(--surface2)", color: srMode === v ? "#fff" : "var(--text-muted)" }}>
                        {icon}
                      </div>
                      <span className="font-bold text-sm" style={{ color: srMode === v ? "#1d4ed8" : "var(--text)" }}>{label}</span>
                      {srMode === v && (
                        <div className="ml-auto w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-xs ml-12" style={{ color: "var(--text-muted)" }}>{desc}</p>
                  </button>
                ))}
              </div>

              {srMode === "in" && (
              <>

              {/* SR Bulk Upload Modal */}
              <AnimatePresence>
                {showSrBulkUpload && (() => {
                  let parsed: { vehicleNo: string; chassisNo: string }[] = [];
                  let fileError = "";
                  const downloadTpl = () => {
                    const csv = "vehicleNo,chassisNo\nCAB-1234,LC1234567890\nXYZ-5678,CH67890123";
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "service-vehicle-template.csv"; a.click();
                    URL.revokeObjectURL(url);
                  };
                  return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl mx-4"
                        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Bulk Upload Vehicles</h3>
                          <button type="button" onClick={() => setShowSrBulkUpload(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: "var(--text-muted)" }}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <div className="mb-3 px-3 py-2.5 rounded-xl text-xs" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                          <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>CSV Format:</p>
                          <code className="font-mono">vehicleNo,chassisNo</code>
                        </div>
                        <button type="button" onClick={downloadTpl} className="flex items-center gap-2 text-sm mb-4 hover:underline" style={{ color: "var(--accent)" }}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          Download Template CSV
                        </button>
                        <label className="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer hover:border-blue-400" style={{ borderColor: "var(--border)" }}>
                          <svg className="w-8 h-8" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Click to upload CSV</p>
                          <input type="file" accept=".csv" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const text = (ev.target?.result as string) ?? "";
                              const lines = text.split(/\r?\n/).filter(Boolean);
                              if (lines.length < 2) { fileError = "No data rows"; return; }
                              parsed = lines.slice(1).map(l => { const c = l.split(",").map(x => x.trim().replace(/^"|"$/g, "")); return { vehicleNo: c[0] ?? "", chassisNo: c[1] ?? "" }; }).filter(r => r.vehicleNo);
                              if (parsed.length > 0) {
                                setS("vehicle", parsed[0].vehicleNo);
                                setSelectedSrVehicleDetail({ vehicleNo: parsed[0].vehicleNo, chassisNo: parsed[0].chassisNo, model: "", make: "", colourFamily: "", colour: "" });
                                setShowSrBulkUpload(false);
                              }
                            };
                            reader.readAsText(f);
                          }} />
                        </label>
                        {fileError && <p className="text-red-500 text-xs mt-2">{fileError}</p>}
                      </motion.div>
                    </div>
                  );
                })()}
              </AnimatePresence>

              {/* SR: Vehicle Details */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Vehicle Details</SectionTitle>

                {/* Row 1: Approver fields — hidden for ASO on auto-approved pass types */}
                {!(session?.user?.role === "AREA_SALES_OFFICER" && asSubType !== "MAIN_OUT") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <Field label="Approver Id" required error={errors.approver}>
                    {assignedApprover ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                        <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="font-medium text-xs truncate">{assignedApprover.name}</span>
                        <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>(auto-assigned)</span>
                      </div>
                    ) : (
                      <SearchInput value={sr.approver} onChange={(v) => { setS("approver", v); void fetchLookup("approver", v); }} onFocus={() => void fetchLookup("approver", sr.approver)} placeholder="Search approver" error={errors.approver} options={lookupOptions.approver} />
                    )}
                  </Field>
                  <Field label="Approver 2 (optional)">
                    <SearchInput value={sr.approver2} onChange={(v) => { setS("approver2", v); void fetchLookup("approver", v); }} onFocus={() => void fetchLookup("approver", sr.approver2)} placeholder="Search approver" options={lookupOptions.approver} />
                  </Field>
                </div>
                )}

                {/* Add Vehicle / General sub-tabs */}
                <div className="flex gap-0 mb-4 border-b" style={{ borderColor: "var(--border)" }}>
                  {(["add", "general"] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => setSrVehicleTab(tab)}
                      className="px-5 py-2 text-sm font-semibold transition-all border-b-2 -mb-px"
                      style={{
                        borderBottomColor: srVehicleTab === tab ? "#2563eb" : "transparent",
                        color: srVehicleTab === tab ? "#2563eb" : "var(--text-muted)",
                        background: "transparent",
                      }}>
                      {tab === "add" ? "Add Vehicle" : "General"}
                    </button>
                  ))}
                </div>

                {srVehicleTab === "add" ? (
                  <>
                    {/* Vehicle Details search */}
                    <Field label="Vehicle Details" required error={errors.vehicle} className="mb-3">
                      <div className="relative">
                        <SearchInput
                          value={sr.vehicle}
                          onChange={(v) => { setS("vehicle", v); void fetchLookup("vehicle", v); if (selectedSrVehicleDetail && v !== sr.vehicle) setSelectedSrVehicleDetail(null); }}
                          onFocus={() => void fetchLookup("vehicle", "")}
                          placeholder="Search by vehicle no or chassis no"
                          error={errors.vehicle}
                          options={lookupOptions.vehicle}
                          onSelect={(o) => { setS("vehicle", o.value); setSelectedSrVehicleDetail({ vehicleNo: o.value, chassisNo: o.chassisNo ?? "", model: o.model ?? "", make: o.make ?? "", colourFamily: o.colourFamily ?? "", colour: o.colour ?? "" }); }}
                          renderOption={(o) => (
                            <div className="flex items-center gap-3 w-full py-0.5">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate" style={{ color: "var(--text)" }}>{o.value}</p>
                                {o.chassisNo && <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{o.chassisNo}</p>}
                              </div>
                              {(o.make || o.model) && <span className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>{[o.make, o.model].filter(Boolean).join(" ")}</span>}
                            </div>
                          )}
                        />
                        {sr.vehicle && (
                          <button type="button" onClick={() => { setS("vehicle", ""); setSelectedSrVehicleDetail(null); }}
                            className="absolute right-9 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200"
                            style={{ color: "var(--text-muted)" }}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                      {selectedSrVehicleDetail && (
                        <div className="mt-2 rounded-xl border grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-2 px-4 py-3"
                          style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                          {[["Chassis", selectedSrVehicleDetail.chassisNo], ["Make", selectedSrVehicleDetail.make], ["Model", selectedSrVehicleDetail.model], ["Colour", selectedSrVehicleDetail.colour || selectedSrVehicleDetail.colourFamily]].map(([lbl, val]) => (
                            <div key={lbl}>
                              <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>{lbl}</p>
                              <p className="text-sm font-medium" style={{ color: val ? "var(--text)" : "var(--text-muted)" }}>{val || "—"}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </Field>

                    {/* On/by field */}
                    <Field label="On/by" className="mb-3">
                      <TextInput value={sr.onBy} onChange={(v) => setS("onBy", v)} placeholder="e.g. customer name or contact" />
                    </Field>

                    {/* Service Job Number */}
                    <Field label="Service Job No." className="mb-3">
                      <TextInput
                        value={sr.serviceJobNo}
                        onChange={(v) => setS("serviceJobNo", v)}
                        placeholder="e.g. SV30-0169298 (optional)"
                      />
                    </Field>

                    {/* Job type */}
                    <Field label="Job" required error={errors.jobType} className="mb-4">
                      <select value={sr.jobType} onChange={(e) => setS("jobType", e.target.value)}
                        className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                        style={{ background: "var(--surface2)", borderColor: errors.jobType ? "#f87171" : "var(--border)", color: sr.jobType ? "var(--text)" : "var(--text-muted)" }}>
                        <option value="">Enter job type…</option>
                        <option value="Routine Service">Routine Service</option>
                        <option value="Repair">Repair</option>
                        <option value="Inspection">Inspection</option>
                        <option value="Body Work">Body Work</option>
                        <option value="Electrical">Electrical</option>
                        <option value="AC Service">AC Service</option>
                        <option value="Warranty Repair">Warranty Repair</option>
                        <option value="PDI">PDI (Pre-Delivery Inspection)</option>
                        <option value="Other">Other</option>
                      </select>
                      {errors.jobType && <p className="text-red-500 text-xs mt-1">{errors.jobType}</p>}
                    </Field>

                    {/* Action buttons row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => { setAddVehicleTarget("sr"); setShowAddVehicle(true); }}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
                        style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                        ADD Vehicle
                      </button>
                      <button type="button" onClick={() => setShowSrBulkUpload(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
                        style={{ background: "#5a9216" }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Bulk Upload
                      </button>
                      <button type="button" onClick={() => {
                        const csv = "vehicleNo,chassisNo\nCAB-1234,LC1234567890\nXYZ-5678,CH67890123";
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = "service-vehicle-template.csv"; a.click();
                        URL.revokeObjectURL(url);
                      }}
                        className="flex items-center gap-1.5 text-sm hover:underline"
                        style={{ color: "var(--accent)" }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Download Bulk Upload Template
                      </button>
                    </div>
                  </>
                ) : (
                  /* General tab — customer details + vehicle parts + job */
                  <div>
                    {/* Customer Name + Contact No */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                      <Field label="Customer Name" required>
                        <TextInput value={sr.customerName} onChange={(v) => setS("customerName", v)} placeholder="Enter customer name" />
                      </Field>
                      <Field label="Contact No" required>
                        <TextInput value={sr.customerContact} onChange={(v) => setS("customerContact", v)} placeholder="Enter customer contact no" numericOnly maxLength={10} />
                      </Field>
                    </div>

                    {/* Add Vehicle Parts */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Add Vehicle Parts</p>
                        <button type="button"
                          onClick={() => { setShowAddPart(true); setEditPartId(null); setPartNameInput(""); setPartIdInput(""); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold"
                          style={{ background: "#5a9216" }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                          Add New Parts
                        </button>
                      </div>

                      {/* Inline add/edit part form */}
                      <AnimatePresence>
                        {showAddPart && (
                          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                            className="mb-3 rounded-xl border p-3 grid grid-cols-1 md:grid-cols-2 gap-3"
                            style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                            <div>
                              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Part Name</label>
                              <input type="text" value={partNameInput} onChange={(e) => setPartNameInput(e.target.value)}
                                placeholder="e.g. Engine" autoFocus
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Part ID</label>
                              <input type="text" value={partIdInput} onChange={(e) => setPartIdInput(e.target.value)}
                                placeholder="e.g. SV30-0169266"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault();
                                    if (!partNameInput.trim()) return;
                                    if (editPartId) {
                                      setSrParts(prev => prev.map(p => p.id === editPartId ? { ...p, partName: partNameInput.trim(), partId: partIdInput.trim() } : p));
                                      setEditPartId(null);
                                    } else {
                                      setSrParts(prev => [...prev, { id: Date.now().toString(), partName: partNameInput.trim(), partId: partIdInput.trim() }]);
                                    }
                                    setPartNameInput(""); setPartIdInput(""); setShowAddPart(false);
                                  }
                                }}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                            </div>
                            <div className="md:col-span-2 flex gap-2 justify-end">
                              <button type="button" onClick={() => { setShowAddPart(false); setEditPartId(null); setPartNameInput(""); setPartIdInput(""); }}
                                className="px-3 py-1.5 rounded-lg text-xs border font-medium"
                                style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface)" }}>Cancel</button>
                              <button type="button"
                                onClick={() => {
                                  if (!partNameInput.trim()) return;
                                  if (editPartId) {
                                    setSrParts(prev => prev.map(p => p.id === editPartId ? { ...p, partName: partNameInput.trim(), partId: partIdInput.trim() } : p));
                                    setEditPartId(null);
                                  } else {
                                    setSrParts(prev => [...prev, { id: Date.now().toString(), partName: partNameInput.trim(), partId: partIdInput.trim() }]);
                                  }
                                  setPartNameInput(""); setPartIdInput(""); setShowAddPart(false);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs text-white font-semibold"
                                style={{ background: "#5a9216" }}>{editPartId ? "Save" : "Add"}</button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Parts table */}
                      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                              {["Part Name", "Part ID", "Action"].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {srParts.length === 0 ? (
                              <tr><td colSpan={3} className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>No parts added yet</td></tr>
                            ) : srParts.map((part) => (
                              <tr key={part.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td className="px-4 py-2.5 font-medium text-sm" style={{ color: "var(--text)" }}>{part.partName}</td>
                                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{part.partId || "—"}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <button type="button" title="Edit"
                                      onClick={() => { setEditPartId(part.id); setPartNameInput(part.partName); setPartIdInput(part.partId); setShowAddPart(true); }}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center border transition-all hover:opacity-80"
                                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--accent)" }}>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button type="button" title="Delete"
                                      onClick={() => setSrParts(prev => prev.filter(p => p.id !== part.id))}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center border transition-all hover:opacity-80"
                                      style={{ background: "var(--surface)", borderColor: "#fecaca", color: "#ef4444" }}>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Job type search */}
                    <Field label="Job" required error={errors.jobType}>
                      <SearchInput
                        value={sr.jobType}
                        onChange={(v) => setS("jobType", v)}
                        placeholder="Search job type"
                        options={[
                          { id: "1", value: "Routine Service", label: "Routine Service" },
                          { id: "2", value: "Repair", label: "Repair" },
                          { id: "3", value: "Inspection", label: "Inspection" },
                          { id: "4", value: "Body Work", label: "Body Work" },
                          { id: "5", value: "Electrical", label: "Electrical" },
                          { id: "6", value: "AC Service", label: "AC Service" },
                          { id: "7", value: "Warranty Repair", label: "Warranty Repair" },
                          { id: "8", value: "PDI", label: "PDI (Pre-Delivery Inspection)" },
                          { id: "9", value: "Other", label: "Other" },
                        ].filter(o => !sr.jobType || o.label.toLowerCase().includes(sr.jobType.toLowerCase()))}
                        onSelect={(o) => setS("jobType", o.value)}
                      />
                      {errors.jobType && <p className="text-red-500 text-xs mt-1">{errors.jobType}</p>}
                    </Field>
                  </div>
                )}
              </div>

              {/* SR: Receiving Location & Schedule */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Location &amp; Schedule</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Receiving Location / Branch" required error={errors.receivingLocation} className="md:col-span-2">
                    <SearchInput
                      value={sr.receivingLocation}
                      onChange={(v) => { setS("receivingLocation", v); void fetchLookup("location", v); }}
                      onFocus={() => void fetchLookup("location", sr.receivingLocation)}
                      placeholder="Search receiving location or branch"
                      error={errors.receivingLocation}
                      options={lookupOptions.location}
                      onSelect={(o) => setS("receivingLocation", o.storageDescription || o.label || o.value)}
                    />
                  </Field>
                  <Field label="Estimated Arrival Date" required error={errors.arrivalDate}>
                    <DatePicker value={sr.arrivalDate} onChange={(v) => setS("arrivalDate", v)} min={today} error={errors.arrivalDate} placeholder="Pick arrival date" />
                  </Field>
                  <Field label="Estimated Arrival Time" required error={errors.arrivalTime}>
                    <TimePicker value={sr.arrivalTime} onChange={(v) => setS("arrivalTime", v)} error={errors.arrivalTime} date={sr.arrivalDate} />
                  </Field>
                </div>
              </div>

              </>
              )}

              {srMode === "out" && (
                <>
                  {/* ASO: Prominent pass-type selector shown before all steps */}
                  {session?.user?.role === "AREA_SALES_OFFICER" && (
                    <div className="rounded-2xl border p-5 mb-5" style={{ background: "var(--surface)", borderColor: "#3b82f644", boxShadow: "var(--card-shadow)" }}>
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#dbeafe" }}>
                          <svg className="w-3.5 h-3.5" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <p className="font-bold text-sm" style={{ color: "var(--text)" }}>What would you like to create?</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          {
                            value: "SUB_OUT" as const,
                            label: "Sub Gate OUT",
                            desc: "Vehicle leaving your location",
                            dot: "#3b82f6", bg: "#eff6ff", color: "#1d4ed8",
                            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
                          },
                          {
                            value: "SUB_IN" as const,
                            label: "Sub Gate IN",
                            desc: "Vehicle arriving to your location",
                            dot: "#22c55e", bg: "#f0fdf4", color: "#15803d",
                            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" /></svg>,
                          },
                          {
                            value: "SUB_OUT_IN" as const,
                            label: "Sub OUT / IN",
                            desc: "OUT from here → IN at another plant",
                            dot: "#f97316", bg: "#fff7ed", color: "#c2410c",
                            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
                          },
                          {
                            value: "MAIN_OUT" as const,
                            label: "Main Gate OUT",
                            desc: "Vehicle handover to customer",
                            dot: "#a855f7", bg: "#faf5ff", color: "#7c3aed",
                            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                          },
                        ] as const).map(({ value, label, desc, dot, bg, color, icon }) => {
                          const selected = asSubType === value;
                          return (
                            <button key={value} type="button"
                              onClick={() => { setAsSubType(value); setErrors({}); }}
                              className="rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm"
                              style={{ borderColor: selected ? dot : "var(--border)", background: selected ? bg : "var(--surface2)" }}>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ background: selected ? dot : "var(--surface)", color: selected ? "#fff" : "var(--text-muted)" }}>
                                  {icon}
                                </div>
                                {selected && (
                                  <div className="ml-auto w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: dot }}>
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                              <p className="font-bold text-xs leading-tight" style={{ color: selected ? color : "var(--text)" }}>{label}</p>
                              <p className="text-[11px] mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>{desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step 1 — Vehicle History Lookup */}
                  <div className="rounded-2xl border mb-5 overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <div className="px-5 py-3 border-b flex items-center gap-3" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                      <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">1</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Vehicle History</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Search to see all existing passes for this vehicle</p>
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={asVehicleSearch}
                          onChange={(e) => setAsVehicleSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchVehiclePasses(asVehicleSearch); } }}
                          placeholder="Vehicle number — e.g. CAB-1234"
                          className="flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                          style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                        />
                        <button
                          type="button"
                          onClick={() => void searchVehiclePasses(asVehicleSearch)}
                          disabled={asVehicleLoading}
                          className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2"
                          style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                        >
                          {asVehicleLoading ? (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          )}
                          {asVehicleLoading ? "Searching…" : "Search"}
                        </button>
                      </div>

                      {asVehiclePasses.length > 0 && (() => {
                        const subTypeCfg: Record<string, { label: string; bg: string; color: string; dot: string; dir: string }> = {
                          MAIN_IN:    { label: "Main IN",    bg: "#f0fdf4", color: "#15803d", dot: "#22c55e", dir: "IN" },
                          SUB_OUT:    { label: "Sub OUT",    bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6", dir: "OUT" },
                          SUB_IN:     { label: "Sub IN",     bg: "#fffbeb", color: "#92400e", dot: "#f59e0b", dir: "IN" },
                          SUB_OUT_IN: { label: "Sub OUT/IN", bg: "#fff7ed", color: "#c2410c", dot: "#f97316", dir: "OUT→IN" },
                          MAIN_OUT:   { label: "Main OUT",   bg: "#fdf4ff", color: "#6b21a8", dot: "#a855f7", dir: "OUT" },
                        };
                        return (
                          <div className="mt-4">
                            <p className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                              {asVehiclePasses.length} pass{asVehiclePasses.length > 1 ? "es" : ""} found for &ldquo;{asVehicleSearch}&rdquo;
                            </p>
                            <div className="relative pl-6">
                              {/* Timeline line */}
                              <div className="absolute left-2 top-3 bottom-3 w-0.5 rounded-full" style={{ background: "var(--border)" }} />
                              <div className="space-y-2">
                                {asVehiclePasses.map((p: any) => {
                                  const cfg = p.passSubType ? subTypeCfg[p.passSubType] : { label: p.passType ?? "Pass", bg: "var(--surface2)", color: "var(--text-muted)", dot: "#9ca3af", dir: "—" };
                                  const isActive = !["COMPLETED", "CANCELLED"].includes(p.status);
                                  return (
                                    <div key={p.id} className="relative">
                                      {/* Timeline dot */}
                                      <div className="absolute -left-6 top-3.5 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                                        style={{ background: isActive ? cfg.dot : "#d1d5db", borderColor: "var(--surface)", boxShadow: isActive ? `0 0 0 3px ${cfg.dot}33` : "none" }} />
                                      <div className="rounded-xl border px-4 py-3 flex items-center justify-between gap-2 transition-all"
                                        style={{ background: isActive ? cfg.bg : "var(--surface2)", borderColor: isActive ? cfg.dot + "55" : "var(--border)" }}>
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <span className="text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0"
                                            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.dot}44` }}>
                                            {cfg.label}
                                          </span>
                                          <span className="font-mono text-sm font-semibold flex-shrink-0" style={{ color: "var(--text)" }}>{p.gatePassNumber}</span>
                                          {p.toLocation && (
                                            <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                                              → {p.toLocation}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-xs px-2 py-0.5 rounded-full border font-medium"
                                            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
                                            {p.status.replace(/_/g, " ")}
                                          </span>
                                          <span className="w-8 text-center text-xs font-extrabold rounded-md py-0.5"
                                            style={{ background: cfg.dir === "IN" ? "#f0fdf4" : "#fef2f2", color: cfg.dir === "IN" ? "#15803d" : "#991b1b" }}>
                                            {cfg.dir}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {asVehiclePasses.length === 0 && asVehicleSearch && !asVehicleLoading && (
                        <div className="mt-4 flex flex-col items-center gap-2 py-6 rounded-xl" style={{ background: "var(--surface2)" }}>
                          <svg className="w-8 h-8" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No passes found for this vehicle</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2 — Create Gate Out Pass */}
                  <div className="rounded-2xl border mb-5 overflow-hidden" style={{ background: "var(--surface)", borderColor: errors.asGateIn ? "#f87171" : "var(--border)" }}>
                    <div className="px-5 py-3 border-b flex items-center gap-3" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: asFoundPass ? "#22c55e" : "#2563eb" }}>
                        {asFoundPass ? (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-white text-xs font-bold">2</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Create Linked Pass</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Find the linked Gate IN pass and choose Sub/Main OUT or Sub IN</p>
                      </div>
                    </div>
                    <div className="p-5">

                      {/* Gate IN search */}
                      <div className="mb-5">
                        <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Gate IN Pass Number</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={asGateInSearch}
                            onChange={(e) => { setAsGateInSearch(e.target.value.toUpperCase()); setAsFoundPass(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchGateInPass(asGateInSearch); } }}
                            placeholder="GP-0001"
                            className="flex-1 border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                            style={{ background: "var(--surface2)", borderColor: errors.asGateIn ? "#f87171" : asFoundPass ? "#86efac" : "var(--border)", color: "var(--text)" }}
                          />
                          <button
                            type="button"
                            onClick={() => void searchGateInPass(asGateInSearch)}
                            disabled={asGateInLoading || !asGateInSearch.trim()}
                            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                            style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                          >
                            {asGateInLoading ? (
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                            ) : null}
                            {asGateInLoading ? "Finding…" : "Find"}
                          </button>
                        </div>
                        {errors.asGateIn && <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>{errors.asGateIn}</p>}
                        {asGateInSearch && !asFoundPass && !asGateInLoading && (
                          <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>Enter a Gate IN pass number (e.g. GP-0001) and click Find</p>
                        )}
                      </div>

                      {/* Found pass vehicle card */}
                      {asFoundPass && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                          className="mb-5 rounded-xl border-2 p-4" style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#22c55e" }}>
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-mono text-sm font-bold" style={{ color: "#166534" }}>{asFoundPass.gatePassNumber}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-md font-bold" style={{ background: "#dcfce7", color: "#15803d" }}>
                                    {asFoundPass.passSubType?.replace("_", " ")}
                                  </span>
                                </div>
                                <p className="font-semibold text-sm" style={{ color: "#14532d" }}>{asFoundPass.vehicle}</p>
                                <div className="flex items-center gap-4 mt-0.5 text-xs" style={{ color: "#166534" }}>
                                  {asFoundPass.chassis && <span>Chassis: <strong>{asFoundPass.chassis}</strong></span>}
                                  {asFoundPass.toLocation && <span>At: <strong>{asFoundPass.toLocation}</strong></span>}
                                </div>
                              </div>
                            </div>
                            <button type="button" onClick={() => { setAsFoundPass(null); setAsGateInSearch(""); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-100"
                              style={{ color: "#6b7280" }}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Pass type cards — only after found */}
                      {asFoundPass && (() => {
                        const subPasses = asFoundPass.subPasses ?? [];
                        const sortedSubs = [...subPasses].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                        // Most recent sub of ANY status (including completed)
                        const lastAnySub = sortedSubs[0];
                        // Most recent sub that is still active (not completed/cancelled)
                        const lastActiveSub = sortedSubs.find((sp: any) => !["COMPLETED", "CANCELLED"].includes(sp.status));
                        // MAIN IN must be COMPLETED (recipient marked as IN) to unlock next steps
                        const mainInConfirmed = asFoundPass.status === "COMPLETED";
                        // For warning message: whether MAIN IN is at least approved (just not yet confirmed)
                        const mainInApprovedOrBetter = ["APPROVED", "GATE_OUT", "COMPLETED"].includes(asFoundPass.status);
                        // Vehicle confirmed out = SUB_OUT has reached GATE_OUT (security confirmed) or COMPLETED
                        const vehicleConfirmedOut = lastAnySub?.passSubType === "SUB_OUT" &&
                          ["GATE_OUT", "COMPLETED"].includes(lastAnySub?.status);
                        // Active sub blocks = active sub that isn't a GATE_OUT SUB_OUT ("vehicle is outside" state)
                        const activeSubBlocks = !!lastActiveSub &&
                          !(lastActiveSub.passSubType === "SUB_OUT" && lastActiveSub.status === "GATE_OUT");
                        // SUB OUT: available when MAIN IN confirmed AND no active sub AND vehicle not already confirmed out
                        const subOutLocked = !mainInConfirmed || activeSubBlocks || vehicleConfirmedOut;
                        // SUB IN: only available when vehicle is confirmed out (SUB_OUT COMPLETED by recipient)
                        const subInLocked = !mainInConfirmed || !vehicleConfirmedOut;
                        // MAIN OUT: same condition as SUB OUT
                        const mainOutLocked = !mainInConfirmed || activeSubBlocks || vehicleConfirmedOut;

                        const notApprovedReason = !mainInApprovedOrBetter
                          ? "Waiting for Main Gate IN approval"
                          : asFoundPass.status === "APPROVED"
                          ? "Initiator must click 'Mark as IN' first"
                          : asFoundPass.status === "GATE_OUT"
                          ? "Waiting for recipient to confirm Gate IN"
                          : "Main Gate IN not yet confirmed";
                        return (
                          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
                            {!mainInConfirmed && (
                              <div className="mb-4 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium"
                                style={{ background: "#fefce8", borderColor: "#fde047", color: "#854d0e" }}>
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                {notApprovedReason}
                              </div>
                            )}
                            {/* Pass sub-type selector — hidden for ASO (they use the top selector) */}
                            {session?.user?.role !== "AREA_SALES_OFFICER" && (
                            <div className="mb-5">
                              <label className="block text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Select Pass Type</label>
                              <div className="grid grid-cols-3 gap-3">
                                {([
                                  {
                                    value: "SUB_OUT" as const,
                                    label: "Sub Gate OUT",
                                    desc: "Vehicle leaving to another plant",
                                    icon: (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                      </svg>
                                    ),
                                    locked: subOutLocked,
                                    lockReason: !mainInConfirmed ? notApprovedReason : vehicleConfirmedOut ? "Vehicle is at another plant — complete Sub Gate IN first" : activeSubBlocks ? "Sub-pass in progress" : notApprovedReason,
                                    bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6",
                                  },
                                  {
                                    value: "SUB_IN" as const,
                                    label: "Sub Gate IN",
                                    desc: "Vehicle returning from another plant",
                                    icon: (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
                                      </svg>
                                    ),
                                    locked: subInLocked,
                                    lockReason: !mainInConfirmed ? notApprovedReason : activeSubBlocks ? "Waiting for Sub Gate OUT to be confirmed by recipient" : "Create & confirm Sub Gate OUT first",
                                    bg: "#fffbeb", color: "#92400e", dot: "#f59e0b",
                                  },
                                  {
                                    value: "MAIN_OUT" as const,
                                    label: "Main Gate OUT",
                                    desc: "Final departure — vehicle leaving permanently",
                                    icon: (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                      </svg>
                                    ),
                                    locked: mainOutLocked,
                                    lockReason: !mainInConfirmed ? notApprovedReason : vehicleConfirmedOut ? "Vehicle is at another plant — complete Sub Gate IN first" : activeSubBlocks ? "Sub-pass in progress" : notApprovedReason,
                                    bg: "#fdf4ff", color: "#6b21a8", dot: "#a855f7",
                                  },
                                ]).map(({ value: v, label, desc, icon, locked, lockReason, bg, color, dot }) => {
                                  const selected = asSubType === v && !locked;
                                  return (
                                    <button
                                      key={v}
                                      type="button"
                                      onClick={() => { if (!locked) setAsSubType(v); }}
                                      className="rounded-xl border-2 p-4 text-left transition-all relative"
                                      style={{
                                        borderColor: locked ? "var(--border)" : selected ? dot : "var(--border)",
                                        background: locked ? "var(--surface2)" : selected ? bg : "var(--surface)",
                                        opacity: locked ? 0.55 : 1,
                                        cursor: locked ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {locked && (
                                        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
                                          style={{ background: "#fef3c7", color: "#92400e" }}>
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                          </svg>
                                          Locked
                                        </div>
                                      )}
                                      {selected && !locked && (
                                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: dot }}>
                                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-3 mb-2">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                                          style={{ background: locked ? "var(--border)" : selected ? dot : "var(--surface2)", color: locked ? "var(--text-muted)" : selected ? "#fff" : color }}>
                                          {icon}
                                        </div>
                                        <span className="font-bold text-sm" style={{ color: locked ? "var(--text-muted)" : selected ? color : "var(--text)" }}>{label}</span>
                                      </div>
                                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                                        {locked ? lockReason : desc}
                                      </p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            )}

                            {/* Location + Departure */}
                            {asSubType !== "MAIN_OUT" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              {/* From Location — auto-filled from found pass (vehicle's current location), read-only */}
                              <Field label="From Location (Current Plant)" required error={errors.asFromLocation}>
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm"
                                  style={{ background: "var(--surface2)", borderColor: errors.asFromLocation ? "#f87171" : "var(--border)", color: "var(--text)" }}>
                                  <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  <span className="font-medium truncate">{asFromLocation || <span className="italic opacity-50">Auto-filled from gate pass</span>}</span>
                                  <span className="ml-auto text-xs flex-shrink-0 px-2 py-0.5 rounded-md" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>auto</span>
                                </div>
                              </Field>
                              {/* To Location — editable destination */}
                              <Field label="To Location (Destination)" required error={errors.asToLocation}>
                                <SearchInput
                                  value={asToLocation}
                                  onChange={(v) => { setAsToLocation(v); setErrors(p => { const n = {...p}; delete n.asToLocation; return n; }); }}
                                  placeholder="Select destination"
                                  error={errors.asToLocation}
                                  options={dimoLocations.filter(o =>
                                    !asToLocation || o.label?.toLowerCase().includes(asToLocation.toLowerCase()) || o.value?.toLowerCase().includes(asToLocation.toLowerCase())
                                  )}
                                  onSelect={(o) => { setAsToLocation(o.storageDescription || o.label || o.value); setErrors(p => { const n = {...p}; delete n.asToLocation; return n; }); }}
                                  renderOption={(o) => (
                                    <div className="py-0.5">
                                      <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{o.storageDescription || o.label}</p>
                                      {o.plantDescription && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{o.plantDescription}</p>}
                                    </div>
                                  )}
                                />
                              </Field>
                            </div>
                            )}
                            {asSubType === "MAIN_OUT" && (() => {
                              const immTerms = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction"];
                              const active = sapPreviewOrders.filter(o => !("cancelled" in o && (o as any).cancelled) && o.orderId);
                              const creditOrders   = active.filter(o => { const t = (o.payTerm || "").toLowerCase().trim(); return t !== "" && !immTerms.includes(t); });
                              const immediateOrders = active.filter(o => immTerms.includes((o.payTerm || "").toLowerCase().trim()) || (o.payTerm || "").trim() === "");
                              const hasCredit = creditOrders.length > 0;
                              return (
                              <div className="mb-4 space-y-3">
                                {/* Info banner */}
                                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium"
                                  style={{ background: "#f5f3ff", borderColor: "#c4b5fd", color: "#5b21b6" }}>
                                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Main Gate OUT — Customer Handover. Payment orders auto-detected from SAP at creation.
                                </div>

                                {/* SAP loading */}
                                {sapPreviewLoading && asFoundPass && (
                                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm"
                                    style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                                    <svg className="animate-spin w-4 h-4 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    <span style={{ color: "var(--text-muted)" }}>Checking SAP payment orders…</span>
                                  </div>
                                )}

                                {/* SAP result — show only when vehicle is linked and fetch done */}
                                {!sapPreviewLoading && asFoundPass && (
                                  <>
                                    {/* Credit orders panel + approver picker */}
                                    {hasCredit ? (
                                      <div className="rounded-xl border-2 overflow-hidden"
                                        style={{ borderColor: errors.mainOutApprover ? "#f87171" : "#2563eb55" }}>
                                        {/* Header */}
                                        <div className="px-4 py-3 flex items-center gap-3"
                                          style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", borderBottom: "1px solid #bfdbfe" }}>
                                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#2563eb" }}>
                                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                            </svg>
                                          </div>
                                          <div>
                                            <p className="text-sm font-bold" style={{ color: "#1e40af" }}>
                                              {creditOrders.length} Credit Order{creditOrders.length !== 1 ? "s" : ""} Found — Approver Required
                                            </p>
                                            <p className="text-xs" style={{ color: "#3b82f6" }}>
                                              {immediateOrders.length > 0
                                                ? `Also ${immediateOrders.length} immediate order${immediateOrders.length !== 1 ? "s" : ""} → Cashier will handle those separately`
                                                : "No immediate orders — only credit approval needed"}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Credit orders table */}
                                        <div style={{ maxHeight: "200px", overflowY: "auto", scrollbarWidth: "thin" }}>
                                          <table className="w-full text-xs border-collapse">
                                            <thead>
                                              <tr style={{ background: "#dbeafe", borderBottom: "1px solid #bfdbfe" }}>
                                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide" style={{ color: "#1e40af" }}>#</th>
                                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide" style={{ color: "#1e40af" }}>Order ID</th>
                                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide" style={{ color: "#1e40af" }}>Status</th>
                                                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide" style={{ color: "#1e40af" }}>Payment Terms</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {creditOrders.map((o, idx) => (
                                                <tr key={o.orderId} style={{ background: idx % 2 === 0 ? "#eff6ff" : "#dbeafe30", borderBottom: "1px solid #bfdbfe" }}>
                                                  <td className="px-3 py-2" style={{ color: "#3b82f6" }}>{idx + 1}</td>
                                                  <td className="px-3 py-2 font-mono font-bold" style={{ color: "#1e40af" }}>{o.orderId}</td>
                                                  <td className="px-3 py-2">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#f1f5f9", color: "#475569" }}>
                                                      {o.orderStatus || "Open"}
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-2">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#dbeafe", color: "#1e40af" }}>
                                                      {o.payTerm || "—"}
                                                    </span>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>

                                        {/* Approver picker */}
                                        <div className="px-4 py-3" style={{ borderTop: "1px solid #bfdbfe", background: "#f8faff" }}>
                                          <label className="block text-xs font-bold mb-1.5 uppercase tracking-wide" style={{ color: "#1e40af" }}>
                                            Select Approver <span style={{ color: "#dc2626" }}>*</span>
                                          </label>
                                          <select
                                            value={mainOutApprover}
                                            onChange={(e) => { setMainOutApprover(e.target.value); setErrors(p => { const n = {...p}; delete n.mainOutApprover; return n; }); }}
                                            className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                            style={{ background: "white", borderColor: errors.mainOutApprover ? "#f87171" : "#bfdbfe", color: mainOutApprover ? "var(--text)" : "#94a3b8" }}
                                          >
                                            <option value="">— Select approver for credit orders —</option>
                                            {lookupOptions.approver.map((o) => (
                                              <option key={o.id ?? o.value} value={o.label ?? o.value}>{o.label ?? o.value}</option>
                                            ))}
                                          </select>
                                          {errors.mainOutApprover && (
                                            <p className="text-xs mt-1 font-medium" style={{ color: "#dc2626" }}>{errors.mainOutApprover}</p>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      /* Cash-only — no approver needed */
                                      active.length > 0 ? (
                                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm"
                                          style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
                                          <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#16a34a" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                          <span style={{ color: "#15803d" }}>
                                            <strong>{active.length} immediate payment order{active.length !== 1 ? "s" : ""}</strong> — Cash only. No approver needed; will go directly to Cashier.
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm"
                                          style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                                          <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span style={{ color: "var(--text-muted)" }}>No SAP orders found for this vehicle — payment type will be confirmed by Cashier.</span>
                                        </div>
                                      )
                                    )}
                                  </>
                                )}
                              </div>
                              );
                            })()}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Field label="Departure Date" required error={errors.departureDate}>
                                <DatePicker value={cd.departureDate} onChange={(v) => setC("departureDate", v)} min={today} error={errors.departureDate} placeholder="Pick departure date" />
                              </Field>
                              <Field label="Departure Time" required error={errors.departureTime}>
                                <TimePicker value={cd.departureTime} onChange={(v) => setC("departureTime", v)} error={errors.departureTime} date={cd.departureDate} />
                              </Field>
                            </div>
                          </motion.div>
                        );
                      })()}

                      {/* Placeholder when no pass found yet */}
                      {!asFoundPass && !asGateInLoading && (
                        <div className="flex flex-col items-center gap-2 py-8 rounded-xl" style={{ background: "var(--surface2)" }}>
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--surface)" }}>
                            <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Find a Gate IN pass to continue</p>
                          <p className="text-xs text-center max-w-xs" style={{ color: "var(--text-muted)" }}>
                            Enter the MAIN IN or SUB IN pass number above to link and create a Gate Out pass for that vehicle
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

            </motion.div>
          ) : isLtLike ? (
            <motion.div key="lt" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>

              {/* Location Type Radio + To Location */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Location Details</SectionTitle>

                {/* Location Type Radio Buttons */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text)" }}>Location Type</label>
                  <div className="flex flex-wrap gap-4">
                    {([
                      { value: "", label: "All" },
                      { value: "DEALER", label: "Dealer" },
                      { value: "DIMO", label: "DIMO" },
                      { value: "PROMOTION", label: "Promotion" },
                      { value: "FINANCE", label: "Finance Institution" },
                    ] as { value: LocationType | ""; label: string }[]).map(({ value: v, label: lbl }) => (
                      <label key={v || "all"} className="flex items-center gap-2 cursor-pointer">
                        <div
                          onClick={() => { setLocationType(v); setL("toLocation", ""); setSelectedLocationDetail(null); }}
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all"
                          style={{ borderColor: locationType === v ? "#2563eb" : "var(--border)" }}
                        >
                          {locationType === v && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                        </div>
                        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{lbl}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {(locationType === "PROMOTION" || locationType === "FINANCE") ? (
                  /* ── 2-column: read-only plant (left) + picker (right) ── */
                  <div className="grid grid-cols-2 gap-3">
                    {/* Left: read-only Plant Name */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Plant Name</label>
                      <div className="border rounded-xl px-4 py-2.5 text-sm min-h-[42px] flex items-center"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: selectedLocationDetail ? "var(--text)" : "var(--text-muted)" }}>
                        {selectedLocationDetail?.plantDescription || <span className="italic opacity-60">Auto-filled on selection</span>}
                      </div>
                    </div>
                    {/* Right: Location picker */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Location <span className="text-red-500">*</span></label>
                      <TwoColumnLocationPicker
                        value={lt.toLocation}
                        displayValue={selectedLocationDetail?.storageDescription}
                        locationType={locationType}
                        error={errors.toLocation}
                        onSelect={(o) => {
                          setL("toLocation", o.value);
                          setSelectedLocationDetail({ plantCode: o.plantCode ?? "", plantDescription: o.plantDescription ?? "", storageLocation: o.storageLocation ?? "", storageDescription: o.storageDescription ?? "" });
                        }}
                        onNewLocation={(o) => {
                          setL("toLocation", o.value);
                          setSelectedLocationDetail({ plantCode: o.plantCode ?? "", plantDescription: o.plantDescription ?? "", storageLocation: o.storageLocation ?? "", storageDescription: o.storageDescription ?? "" });
                        }}
                      />
                      {errors.toLocation && <p className="text-red-500 text-xs mt-1">{errors.toLocation}</p>}
                    </div>
                  </div>
                ) : (
                  <Field label="To Location" required error={errors.toLocation}>
                    <SearchInput
                      value={lt.toLocation}
                      onChange={(v) => { setL("toLocation", v); setSelectedLocationDetail(null); void fetchLookup("location", v, locationType || undefined); }}
                      onFocus={() => { if (lookupOptions.location.length === 0) void fetchLookup("location", lt.toLocation, locationType || undefined); }}
                      placeholder="Search location"
                      error={errors.toLocation}
                      loading={locationLoading}
                      options={lookupOptions.location}
                      onSelect={(o) => {
                        setSelectedLocationDetail({
                          plantCode: o.plantCode ?? "",
                          plantDescription: o.plantDescription ?? "",
                          storageLocation: o.storageLocation ?? "",
                          storageDescription: o.storageDescription ?? "",
                        });
                      }}
                    />
                    {selectedLocationDetail && (
                      <div className="mt-2 rounded-xl px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1.5"
                        style={{ background: "var(--surface-2, #f0f4ff)", border: "1px solid var(--border)", color: "var(--text-muted, #6b7280)" }}>
                        <span><span className="font-semibold" style={{ color: "var(--text)" }}>Plant:</span> {selectedLocationDetail.plantCode} – {selectedLocationDetail.plantDescription}</span>
                        <span><span className="font-semibold" style={{ color: "var(--text)" }}>Sloc:</span> {selectedLocationDetail.storageLocation}</span>
                        <span><span className="font-semibold" style={{ color: "var(--text)" }}>Description:</span> {selectedLocationDetail.storageDescription}</span>
                      </div>
                    )}
                  </Field>
                )}
              </div>

              {/* Vehicle Details */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Vehicle Details</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Out Reason" required error={errors.outReason}>
                    <SearchInput
                      value={lt.outReason}
                      onChange={(v) => { setL("outReason", v); void fetchLookup("outReason", v); }}
                      onFocus={() => void fetchLookup("outReason", lt.outReason)}
                      placeholder="Search out reason"
                      error={errors.outReason}
                      options={lookupOptions.outReason}
                    />
                  </Field>

                  {/* Vehicle with Add New + format hint */}
                  <Field label="Vehicle" required error={errors.vehicle} className="md:col-span-2">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <SearchInput
                          value={lt.vehicle}
                          onChange={(v) => {
                            setL("vehicle", v);
                            void fetchLookup("vehicle", v);
                            // Clear detail card if user types something different from selection
                            if (selectedVehicleDetail && v !== lt.vehicle) setSelectedVehicleDetail(null);
                          }}
                          onFocus={() => void fetchLookup("vehicle", "")}
                          placeholder="Search by vehicle no or chassis no"
                          error={errors.vehicle}
                          options={lookupOptions.vehicle}
                          onSelect={(o) => {
                            setL("vehicle", o.value);
                            const detail = {
                              chassisNo:    o.chassisNo    ?? "",
                              model:        o.model        ?? "",
                              make:         o.make         ?? "",
                              colourFamily: o.colourFamily ?? "",
                              colour:       o.colour       ?? "",
                            };
                            setSelectedVehicleDetail(detail);
                            // Auto-detect vehicle's current location
                            void fetchVehicleCurrentLocation(o.value).then((loc) => {
                              if (loc) {
                                setL("fromLocation", loc);
                                setSelectedVehicleDetail({ ...detail, currentLocation: loc });
                              }
                            });
                          }}
                          renderOption={(o) => (
                            <div className="flex items-center gap-3 w-full py-0.5">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate" style={{ color: "var(--text)" }}>{o.value}</p>
                                {o.chassisNo && <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{o.chassisNo}</p>}
                              </div>
                              {(o.make || o.model) && (
                                <span className="text-xs flex-shrink-0 text-right" style={{ color: "var(--text-muted)" }}>
                                  {[o.make, o.model].filter(Boolean).join(" ")}
                                </span>
                              )}
                            </div>
                          )}
                        />
                        {/* Clear button */}
                        {lt.vehicle && (
                          <button
                            type="button"
                            onClick={() => { setL("vehicle", ""); setSelectedVehicleDetail(null); void fetchLookup("vehicle", ""); }}
                            className="absolute right-9 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                            style={{ color: "var(--text-muted)" }}
                            title="Clear vehicle"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Vehicle detail card */}
                    {selectedVehicleDetail && (
                      <div className="mt-3 rounded-xl border px-4 py-3"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                        {/* Current Location — prominent row at top */}
                        <div className="flex items-center gap-2 pb-3 mb-3" style={{ borderBottom: "1px solid var(--border)" }}>
                          <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Current Location</p>
                            <p className="text-sm font-semibold" style={{ color: selectedVehicleDetail.currentLocation ? "#2563eb" : "var(--text-muted)" }}>
                              {selectedVehicleDetail.currentLocation ?? (
                                <span className="italic font-normal">Detecting…</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                        {[
                          { label: "Chassis No",    val: selectedVehicleDetail.chassisNo },
                          { label: "Model",         val: selectedVehicleDetail.model },
                          { label: "Make",          val: selectedVehicleDetail.make },
                          { label: "Colour Family", val: selectedVehicleDetail.colourFamily },
                          { label: "Colour",        val: selectedVehicleDetail.colour },
                        ].map(({ label, val }) => (
                          <div key={label}>
                            <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
                            <p className="text-sm font-medium" style={{ color: val ? "var(--text)" : "var(--text-muted)" }}>
                              {val || "—"}
                            </p>
                          </div>
                        ))}
                        </div>
                      </div>
                    )}
                  </Field>

                  <Field label="Approver" required error={errors.approver} className="md:col-span-2">
                    {assignedApprover ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                        <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="font-medium">{assignedApprover.name}</span>
                        <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>(auto-assigned)</span>
                      </div>
                    ) : (
                      <SearchInput
                        value={lt.approver}
                        onChange={(v) => { setL("approver", v); void fetchLookup("approver", v); }}
                        onFocus={() => void fetchLookup("approver", lt.approver)}
                        placeholder="Search approver"
                        error={errors.approver}
                        options={lookupOptions.approver}
                      />
                    )}
                  </Field>
                </div>
              </div>

              {/* Gate Out — Schedule Departure */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Gate Out — Schedule Departure</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Estimated Departure Date" required error={errors.departureDate}>
                    <DatePicker value={lt.departureDate} onChange={(v) => setL("departureDate", v)} min={today} error={errors.departureDate} placeholder="Pick departure date" />
                  </Field>
                  <Field label="Estimated Departure Time" required error={errors.departureTime}>
                    <TimePicker value={lt.departureTime} onChange={(v) => setL("departureTime", v)} error={errors.departureTime} date={lt.departureDate} />
                  </Field>
                  <Field label="Reason" className="md:col-span-2">
                    <SearchInput value={lt.reasonToOut} onChange={(v) => setL("reasonToOut", v)} placeholder="Search reason to out" />
                  </Field>
                </div>
              </div>

              {/* Gate In — Expected Arrival (LT is round-trip) */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Gate In — Expected Arrival</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Expected Arrival Date">
                    <DatePicker value={lt.arrivalDate} onChange={(v) => setL("arrivalDate", v)} min={lt.departureDate || today} placeholder="Pick arrival date" />
                  </Field>
                  <Field label="Expected Arrival Time">
                    <TimePicker value={lt.arrivalTime} onChange={(v) => setL("arrivalTime", v)} date={lt.arrivalDate} />
                  </Field>
                </div>
              </div>

            </motion.div>
          ) : (
            <motion.div key="cd" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>

                  {/* Vehicle Details — Customer Delivery */}
                  <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <SectionTitle>Vehicle Details</SectionTitle>
                    <div className="grid grid-cols-1 gap-4">

                      <Field label="Vehicle" required error={errors.vehicle} className="md:col-span-2">
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <SearchInput
                              value={cd.vehicle}
                              onChange={(v) => {
                                setC("vehicle", v);
                                void fetchLookup("vehicle", v);
                                if (selectedCdVehicleDetail && v !== cd.vehicle) setSelectedCdVehicleDetail(null);
                              }}
                              onFocus={() => void fetchLookup("vehicle", "")}
                              onSelect={(o) => {
                                setC("vehicle", o.value);
                                setSelectedCdVehicleDetail({ vehicleNo: o.value, chassisNo: o.chassisNo ?? "", model: o.model ?? "", make: o.make ?? "", colourFamily: o.colourFamily ?? "", colour: o.colour ?? "" });
                              }}
                              placeholder="Search by vehicle no or chassis no"
                              error={errors.vehicle}
                              options={lookupOptions.vehicle}
                              renderOption={(o) => (
                                <div className="flex items-center gap-3 w-full py-0.5">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold truncate" style={{ color: "var(--text)" }}>{o.value}</p>
                                    {o.chassisNo && <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{o.chassisNo}</p>}
                                  </div>
                                  {(o.make || o.model) && (
                                    <span className="text-xs flex-shrink-0 text-right" style={{ color: "var(--text-muted)" }}>
                                      {[o.make, o.model].filter(Boolean).join(" ")}
                                    </span>
                                  )}
                                </div>
                              )}
                            />
                            {cd.vehicle && (
                              <button
                                type="button"
                                onClick={() => { setC("vehicle", ""); setSelectedCdVehicleDetail(null); void fetchLookup("vehicle", ""); }}
                                className="absolute right-9 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
                                style={{ color: "var(--text-muted)" }}
                                title="Clear vehicle"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                        {selectedCdVehicleDetail && (
                          <div className="mt-3 rounded-xl border grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 px-4 py-3"
                            style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                            {[
                              { label: "Chassis No",    val: selectedCdVehicleDetail.chassisNo },
                              { label: "Model",         val: selectedCdVehicleDetail.model },
                              { label: "Make",          val: selectedCdVehicleDetail.make },
                              { label: "Colour Family", val: selectedCdVehicleDetail.colourFamily },
                              { label: "Colour",        val: selectedCdVehicleDetail.colour },
                            ].map(({ label, val }) => (
                              <div key={label}>
                                <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
                                <p className="text-sm font-medium" style={{ color: val ? "var(--text)" : "var(--text-muted)" }}>{val || "—"}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </Field>
                    </div>
                  </div>

                  {/* SAP Invoice Status */}
                  {(cdSapLoading || cdSapLoaded) && selectedCdVehicleDetail && (
                    <div className="rounded-2xl border mb-5 overflow-hidden"
                      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                      {/* Header */}
                      <div className="px-5 py-3 flex items-center gap-3 border-b"
                        style={{ borderColor: "var(--border)" }}>
                        <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>SAP Invoice Status</p>
                        {cdSapLoading && (
                          <svg className="animate-spin w-3.5 h-3.5 ml-auto" style={{ color: "#2563eb" }} fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        )}
                      </div>
                      <div className="px-5 py-4">
                        {cdSapLoading ? (
                          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Checking SAP invoice records…</p>
                        ) : cdSapOrders.length === 0 ? (
                          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                            style={{ background: "#fef9c3", border: "1px solid #fde047" }}>
                            <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#a16207" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm font-medium" style={{ color: "#a16207" }}>No SAP billing records found for this vehicle</p>
                          </div>
                        ) : (() => {
                          const isInvoiced = cdSapOrders.some(o => (o as any).orderStatusCode === "H070");
                          return (
                            <div className="space-y-3">
                              {/* Status badge */}
                              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl ${isInvoiced ? "" : ""}`}
                                style={{
                                  background: isInvoiced ? "#f0fdf4" : "#fff7ed",
                                  border: `1px solid ${isInvoiced ? "#86efac" : "#fed7aa"}`,
                                }}>
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ background: isInvoiced ? "#16a34a" : "#f97316" }} />
                                <p className="text-sm font-semibold" style={{ color: isInvoiced ? "#15803d" : "#c2410c" }}>
                                  {isInvoiced ? "Invoiced — Billing Complete (HSTAT: H070)" : "Not Yet Invoiced — Billing Pending"}
                                </p>
                              </div>
                              {/* Orders table */}
                              <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr style={{ background: "var(--surface2)" }}>
                                      {["Order ID", "Status", "HSTAT", "Billing Type", "Billing Date"].map(h => (
                                        <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)", fontSize: "9px" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cdSapOrders.map((o, i) => {
                                      const hstat = (o as any).orderStatusCode ?? "";
                                      const invoiced = hstat === "H070";
                                      return (
                                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                          <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--text)" }}>{o.orderId}</td>
                                          <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{o.orderStatus}</td>
                                          <td className="px-3 py-2">
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                                              style={{
                                                background: invoiced ? "#dcfce7" : "#fef3c7",
                                                color: invoiced ? "#15803d" : "#b45309",
                                              }}>{hstat || "—"}</span>
                                          </td>
                                          <td className="px-3 py-2 font-mono" style={{ color: "var(--text-muted)" }}>{(o as any).billingType || "—"}</td>
                                          <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{(o as any).billingDate || "—"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Gate Out */}
                  <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <SectionTitle>Gate Out from Dimo 800</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Estimated Departure Date" required error={errors.departureDate}>
                        <DatePicker value={cd.departureDate} onChange={(v) => setC("departureDate", v)} min={today} error={errors.departureDate} placeholder="Pick departure date" />
                      </Field>
                      <Field label="Estimated Departure Time" required error={errors.departureTime}>
                        <TimePicker value={cd.departureTime} onChange={(v) => setC("departureTime", v)} error={errors.departureTime} date={cd.departureDate} />
                      </Field>
                    </div>
                  </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Transportation Details + Additional Details — hidden for SR OUT */}
        {!(isSr && srMode === "out") && (
          <>
            <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <SectionTitle>Transportation Details</SectionTitle>

          <div className="flex items-center gap-6 mb-5">
            {transportModes.map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setTransportMode(m)}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all"
                  style={{ borderColor: transportMode === m ? "#2563eb" : "var(--border)" }}
                >
                  {transportMode === m && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                </div>
                <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{modeLabel[m]}</span>
              </label>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={transportMode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Carrier Details — only for CARRIER mode */}
              {transportMode === "CARRIER" && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Carrier Details</p>
                    <button type="button"
                      onClick={() => setShowAddCarrier(s => !s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold"
                      style={{ background: "#5a9216" }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                      Add New Carrier
                    </button>
                  </div>
                  {/* Inline add carrier form */}
                  <AnimatePresence>
                    {showAddCarrier && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="mb-4 rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3"
                        style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
                        <div>
                          <label className="block text-xs font-semibold mb-1" style={{ color: "#166534" }}>Company Name</label>
                          <input type="text" value={newCarrierName} onChange={(e) => setNewCarrierName(e.target.value)}
                            placeholder="Enter carrier company name"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                            style={{ borderColor: "#86efac", background: "#fff", color: "var(--text)" }} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1" style={{ color: "#166534" }}>Registration No</label>
                          <input type="text" value={newCarrierReg} onChange={(e) => setNewCarrierReg(e.target.value)}
                            placeholder="e.g. WP-CAR-1234"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                            style={{ borderColor: "#86efac", background: "#fff", color: "var(--text)" }} />
                        </div>
                        <div className="md:col-span-2 flex gap-2 justify-end">
                          <button type="button" onClick={() => { setShowAddCarrier(false); setNewCarrierName(""); setNewCarrierReg(""); }}
                            className="px-4 py-1.5 rounded-lg text-sm border font-medium"
                            style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface)" }}>Cancel</button>
                          <button type="button"
                            onClick={() => {
                              if (newCarrierName.trim()) {
                                setCarrier("companyName", newCarrierName.trim());
                                if (newCarrierReg.trim()) setCarrier("carrierRegNo", newCarrierReg.trim());
                                setShowAddCarrier(false); setNewCarrierName(""); setNewCarrierReg("");
                              }
                            }}
                            className="px-4 py-1.5 rounded-lg text-sm text-white font-semibold"
                            style={{ background: "#16a34a" }}>Use This Carrier</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <Field label="Company Name" required error={errors.companyName}>
                      <SearchInput
                        value={carrierFields.companyName}
                        onChange={(v) => { setCarrier("companyName", v); void fetchLookup("companyName", v); }}
                        onFocus={() => void fetchLookup("companyName", carrierFields.companyName)}
                        onSelect={(o) => { setCarrier("companyName", o.value); if (o.registrationNo) setCarrier("carrierRegNo", o.registrationNo); }}
                        placeholder="Search company name"
                        error={errors.companyName}
                        options={lookupOptions.companyName}
                      />
                    </Field>
                    <Field label="Carrier Registration No">
                      <SearchInput
                        value={carrierFields.carrierRegNo}
                        onChange={(v) => { setCarrier("carrierRegNo", v); void fetchLookup("carrierRegNo", v); }}
                        onFocus={() => void fetchLookup("carrierRegNo", carrierFields.carrierRegNo)}
                        onSelect={(o) => { setCarrier("carrierRegNo", o.value); if (o.companyName) setCarrier("companyName", o.companyName); }}
                        placeholder="Search carrier registration no"
                        options={lookupOptions.carrierRegNo}
                      />
                    </Field>
                  </div>
                </>
              )}

              {/* Driver Details — for CARRIER, DRIVER, OTHER */}
              {(transportMode === "CARRIER" || transportMode === "DRIVER" || transportMode === "OTHER") && (
                <>
                  <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Driver Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="DL / NIC No" required={transportMode === "CARRIER"} error={errors.driverNIC}>
                      <TextInput value={carrierFields.driverNIC} onChange={(v) => setCarrier("driverNIC", v)} placeholder="e.g. 123456789V or 200012345678" nicOnly maxLength={12} error={errors.driverNIC} />
                    </Field>
                    <Field label="Driver Name" required={transportMode === "CARRIER"} error={errors.driverName}>
                      <TextInput value={carrierFields.driverName} onChange={(v) => setCarrier("driverName", v)} placeholder="Enter driver name" error={errors.driverName} />
                    </Field>
                    <Field label="Contact No">
                      <TextInput value={carrierFields.contactNo} onChange={(v) => setCarrier("contactNo", v)} placeholder="Enter driver contact no" numericOnly maxLength={10} />
                    </Field>
                  </div>
                </>
              )}

              {/* Customer Details — only for CUSTOMER mode */}
              {transportMode === "CUSTOMER" && (
                <>
                  <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Customer Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Customer Name">
                      <TextInput value={carrierFields.driverName} onChange={(v) => setCarrier("driverName", v)} placeholder="Enter customer name" />
                    </Field>
                    <Field label="Contact No">
                      <TextInput value={carrierFields.contactNo} onChange={(v) => setCarrier("contactNo", v)} placeholder="Enter customer contact no" numericOnly maxLength={10} />
                    </Field>
                  </div>
                </>
              )}

            </motion.div>
          </AnimatePresence>
            </div>

            {/* Mileage / Additional Details — hidden for Service/Repair */}
            {!isSr && (
            <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <SectionTitle>{isLtLike ? "Mileage Details" : "Additional Details"}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Mileage (Km) / Meter Reading (H)">
              <TextInput value={mileageFields.mileage} onChange={(v) => setMileage("mileage", v)} placeholder="Enter mileage or meter reading" numericOnly />
            </Field>
            <Field label="Insurance Arrangements">
              <TextInput value={mileageFields.insurance} onChange={(v) => setMileage("insurance", v)} placeholder="Enter insurance arrangements" />
            </Field>
            <Field label="Garage Plate / Trade Plate Allocation" className="md:col-span-2">
              <TextInput value={mileageFields.garagePlate} onChange={(v) => setMileage("garagePlate", v)} placeholder="Enter garage plate or trade plate allocation" />
            </Field>
          </div>
            </div>
            )}
          </>
        )}

        {errors.form && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-600 bg-red-50 border border-red-200">{errors.form}</div>
        )}

        {/* Error summary — shown when submit is blocked */}
        {Object.keys(errors).length > 0 && (
          <div className="mb-4 rounded-2xl border px-5 py-4" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
            <p className="text-sm font-bold mb-2" style={{ color: "#991b1b" }}>Please fix the following before submitting:</p>
            <ul className="space-y-1">
              {Object.entries(errors).map(([, msg]) => (
                <li key={msg} className="text-sm flex items-center gap-2" style={{ color: "#b91c1c" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pb-6">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/gate-pass")}
            className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: "#ef4444" }}
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.97 }}
            className="px-8 py-3 rounded-xl text-sm font-semibold text-white shadow-lg disabled:opacity-70 flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}
          >
            {loading && (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {loading ? "Submitting..." : "Submit"}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
}
