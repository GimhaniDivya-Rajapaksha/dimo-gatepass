"use client";
import { useState, useEffect } from "react";
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

function SearchInput({ value, onChange, placeholder, error, onFocus, options, onSelect }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  onFocus?: () => void;
  options?: LookupOption[];
  onSelect?: (o: LookupOption) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); onFocus?.(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
        style={{ background: "var(--surface2)", borderColor: error ? "#f87171" : "var(--border)", color: "var(--text)" }}
      />
      <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {open && options && options.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-52 overflow-auto rounded-xl border shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-500/10"
              style={{ color: "var(--text)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o.value); onSelect?.(o); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, error, type = "text", numericOnly = false, nicOnly = false, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: string; type?: string;
  numericOnly?: boolean; nicOnly?: boolean; maxLength?: number;
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
    if (!vehicleNo.trim())    e.vehicleNo    = "Vehicle / chassis no is mandatory";
    if (!model.trim())        e.model        = "Vehicle model is mandatory";
    if (!make)                e.make         = "Vehicle make is mandatory";
    if (!colourFamily)        e.colourFamily = "Vehicle model is mandatory";
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
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl mx-4"
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
          {/* Vehicle / Chassis No */}
          <Field label="Vehicle / Chassis No" required error={errors.vehicleNo}>
            <input
              value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="Enter vehicle no or chassis no"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
              style={inputStyle(errors.vehicleNo)}
            />
          </Field>

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

/* ─── Bulk Upload Modal ─────────────────────────────────────────────── */
type BulkVehicle = { vehicleNo: string; chassisNo: string };

function BulkUploadModal({ onClose, onUpload }: {
  onClose: () => void;
  onUpload: (vehicles: BulkVehicle[]) => void;
}) {
  const [parsed, setParsed] = useState<BulkVehicle[]>([]);
  const [error, setError] = useState("");

  const downloadTemplate = () => {
    const csv = "vehicleNo,chassisNo\nCAB-1234,LC1234567890\nXYZ-5678,CH67890123\nWXY-9001,";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vehicle-upload-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setError("No data rows found — file needs a header row plus data"); return; }
      const rows: BulkVehicle[] = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        return { vehicleNo: cols[0] ?? "", chassisNo: cols[1] ?? "" };
      }).filter(r => r.vehicleNo);
      if (rows.length === 0) { setError("No valid vehicle numbers found in file"); return; }
      setParsed(rows);
      setError("");
    };
    reader.readAsText(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl mx-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Bulk Upload Vehicles</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* CSV format hint */}
        <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
          <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>CSV Format (header row required):</p>
          <code className="font-mono">vehicleNo,chassisNo</code><br />
          <code className="font-mono opacity-70">CAB-1234,LC1234567890</code><br />
          <code className="font-mono opacity-70">XYZ-5678,CH67890123</code>
        </div>

        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 text-sm mb-4 hover:underline"
          style={{ color: "var(--accent)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Template CSV
        </button>

        <label
          className="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors hover:border-blue-400"
          style={{ borderColor: "var(--border)" }}
        >
          <svg className="w-8 h-8" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Click to upload CSV</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Only .csv files are supported</p>
          <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </label>

        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

        {parsed.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>
              {parsed.length} vehicle{parsed.length !== 1 ? "s" : ""} ready to upload
            </p>
            <div className="max-h-40 overflow-auto rounded-xl border text-xs" style={{ borderColor: "var(--border)" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "var(--surface2)" }}>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>#</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Vehicle No</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Chassis No</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-1.5" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono" style={{ color: "var(--text)" }}>{r.vehicleNo}</td>
                      <td className="px-3 py-1.5 font-mono" style={{ color: "var(--text-muted)" }}>{r.chassisNo || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
            style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface2)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (parsed.length > 0) { onUpload(parsed); onClose(); } }}
            disabled={parsed.length === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}
          >
            {parsed.length > 0 ? `Add ${parsed.length} Vehicle${parsed.length !== 1 ? "s" : ""}` : "Add Vehicles"}
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
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [cdVehicles, setCdVehicles] = useState<BulkVehicle[]>([]);
  const [assignedApprover, setAssignedApprover] = useState<{ id: string; name: string } | null>(null);

  const [lookupOptions, setLookupOptions] = useState<LookupState>({
    location: [], outReason: [], vehicle: [],
    approver: [], companyName: [], carrierRegNo: [],
  });

  // Location Transfer / After Sales fields (shared structure)
  const [lt, setLt] = useState({
    toLocation: "", outReason: "", vehicle: "",
    approver: "", departureDate: "", departureTime: "", reasonToOut: "",
    companyName: "", carrierRegNo: "", driverNIC: "", driverName: "",
    contactNo: "", mileage: "", insurance: "", garagePlate: "",
  });

  // Customer Delivery fields
  const [cd, setCd] = useState({
    approver: "", vehicleSearch: "", departureDate: "", departureTime: "",
    companyName: "", carrierRegNo: "", driverNIC: "", driverName: "",
    contactNo: "", mileage: "", insurance: "", garagePlate: "",
  });

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "INITIATOR") router.replace("/");
  }, [status, session, router]);

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
          }
        })
        .catch(() => {});
    }
  }, [status]);

  const fetchLookup = async (field: LookupField, q = "", lt_type?: string) => {
    try {
      const params = new URLSearchParams({ field, q, limit: "40" });
      if (field === "location" && lt_type) params.set("locationType", lt_type);
      const res = await fetch(`/api/lookups?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { options?: LookupOption[] };
      setLookupOptions((prev) => ({ ...prev, [field]: data.options ?? [] }));
    } catch {
      // silently keep existing options
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, locationType]);

  if (status === "loading") return null;

  const setL = (k: keyof typeof lt, v: string) => {
    setLt((p) => ({ ...p, [k]: v }));
    setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  const setC = (k: keyof typeof cd, v: string) => {
    setCd((p) => ({ ...p, [k]: v }));
    setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  const isLtLike = passType === "LOCATION_TRANSFER" || passType === "AFTER_SALES";

  const setCarrier = (k: string, v: string) => {
    if (isLtLike) setL(k as keyof typeof lt, v);
    else setC(k as keyof typeof cd, v);
  };

  const setMileage = (k: string, v: string) => {
    if (isLtLike) setL(k as keyof typeof lt, v);
    else setC(k as keyof typeof cd, v);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (isLtLike) {
      if (!lt.toLocation) e.toLocation = "Required";
      if (!lt.outReason) e.outReason = "Required";
      if (!lt.vehicle) e.vehicle = "Required";
      if (!lt.approver) e.approver = "Required";
      if (!lt.departureDate) e.departureDate = "Required";
      if (!lt.departureTime) e.departureTime = "Required";
    } else {
      if (!cd.approver) e.approver = "Required";
      if (cdVehicles.length === 0) e.vehicleDetails = "Add at least one vehicle";
      if (!cd.departureDate) e.departureDate = "Required";
      if (!cd.departureTime) e.departureTime = "Required";
    }
    if (transportMode === "CARRIER") {
      const src = isLtLike ? lt : cd;
      if (!src.companyName) e.companyName = "Required";
      if (!src.driverNIC) e.driverNIC = "Required";
      if (!src.driverName) e.driverName = "Required";
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setLoading(true);

    const vehicleDetailsStr = cdVehicles
      .map(v => v.chassisNo ? `${v.vehicleNo}/${v.chassisNo}` : v.vehicleNo)
      .join(", ");

    const ltCarrierMileage = { companyName: lt.companyName, carrierRegNo: lt.carrierRegNo, driverName: lt.driverName, driverNIC: lt.driverNIC, driverContact: lt.contactNo, mileage: lt.mileage, insurance: lt.insurance, garagePlate: lt.garagePlate };
    const cdCarrierMileage = { companyName: cd.companyName, carrierRegNo: cd.carrierRegNo, driverName: cd.driverName, driverNIC: cd.driverNIC, driverContact: cd.contactNo, mileage: cd.mileage, insurance: cd.insurance, garagePlate: cd.garagePlate };

    const payload = isLtLike
      ? {
          passType,
          vehicle: lt.vehicle,
          toLocation: lt.toLocation,
          outReason: lt.outReason,
          approver: lt.approver,
          departureDate: lt.departureDate,
          departureTime: lt.departureTime,
          transportMode,
          ...ltCarrierMileage,
        }
      : {
          passType: "CUSTOMER_DELIVERY",
          vehicle: cdVehicles[0]?.vehicleNo ?? vehicleDetailsStr,
          vehicleDetails: vehicleDetailsStr,
          approver: cd.approver,
          departureDate: cd.departureDate,
          departureTime: cd.departureTime,
          transportMode,
          ...cdCarrierMileage,
        };

    try {
      const res = await fetch("/api/gate-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      setSubmitted(true);
      setTimeout(() => router.push("/gate-pass"), 2500);
    } catch {
      setLoading(false);
      setErrors({ form: "Failed to submit. Please try again." });
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

  const transportModes = isLtLike
    ? (["CARRIER", "OTHER"] as TransportMode[])
    : (["CARRIER", "DRIVER", "CUSTOMER"] as TransportMode[]);

  const modeLabel: Record<TransportMode, string> = {
    CARRIER: "Carrier", DRIVER: "Driver", CUSTOMER: "Customer", OTHER: "Other",
  };

  const carrierFields = isLtLike
    ? { companyName: lt.companyName, carrierRegNo: lt.carrierRegNo, driverNIC: lt.driverNIC, driverName: lt.driverName, contactNo: lt.contactNo }
    : { companyName: cd.companyName, carrierRegNo: cd.carrierRegNo, driverNIC: cd.driverNIC, driverName: cd.driverName, contactNo: cd.contactNo };

  const mileageFields = isLtLike
    ? { mileage: lt.mileage, insurance: lt.insurance, garagePlate: lt.garagePlate }
    : { mileage: cd.mileage, insurance: cd.insurance, garagePlate: cd.garagePlate };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {/* Modals */}
      <AnimatePresence>
        {showAddVehicle && (
          <AddVehicleModal
            onClose={() => setShowAddVehicle(false)}
            onAdd={(opt) => {
              setL("vehicle", opt.value);
              void fetchLookup("vehicle", opt.value);
            }}
          />
        )}
        {showBulkUpload && (
          <BulkUploadModal
            onClose={() => setShowBulkUpload(false)}
            onUpload={(vehicles) => {
              setCdVehicles((prev) => {
                const existing = new Set(prev.map(v => v.vehicleNo));
                const newOnes = vehicles.filter(v => !existing.has(v.vehicleNo));
                return [...prev, ...newOnes];
              });
              setErrors((p) => { const n = { ...p }; delete n.vehicleDetails; return n; });
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

      {/* Type Toggle */}
      <div className="flex flex-wrap gap-3 mb-6">
        {([
          { type: "LOCATION_TRANSFER", label: "Location Transfer" },
          { type: "CUSTOMER_DELIVERY", label: "Customer Delivery" },
          { type: "AFTER_SALES", label: "After Sales IN/OUT" },
        ] as { type: PassType; label: string }[]).map(({ type: t, label }) => (
          <motion.button
            key={t}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { setPassType(t); setErrors({}); setTransportMode("CARRIER"); setCdVehicles([]); setLocationType(""); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all"
            style={passType === t
              ? { background: "linear-gradient(135deg, #1a4f9e, #2563eb)", color: "#fff", border: "none" }
              : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
            }
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            {label}
          </motion.button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <AnimatePresence mode="wait">
          {isLtLike ? (
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
                          onClick={() => { setLocationType(v); setL("toLocation", ""); }}
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

                <Field label="To Location" required error={errors.toLocation}>
                  <SearchInput
                    value={lt.toLocation}
                    onChange={(v) => { setL("toLocation", v); void fetchLookup("location", v, locationType || undefined); }}
                    onFocus={() => void fetchLookup("location", lt.toLocation, locationType || undefined)}
                    placeholder="Search location"
                    error={errors.toLocation}
                    options={lookupOptions.location}
                  />
                </Field>
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
                      <div className="flex-1">
                        <SearchInput
                          value={lt.vehicle}
                          onChange={(v) => { setL("vehicle", v); void fetchLookup("vehicle", v); }}
                          onFocus={() => void fetchLookup("vehicle", lt.vehicle)}
                          placeholder="Search by vehicle no or chassis no"
                          error={errors.vehicle}
                          options={lookupOptions.vehicle}
                          onSelect={(o) => { setL("vehicle", o.value); }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddVehicle(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold whitespace-nowrap"
                        style={{ background: "#5a9216" }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Add New Vehicle
                      </button>
                    </div>
                    {/* Format hint */}
                    <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                      <span className="font-medium">Format:</span> Vehicle No / Chassis No &nbsp;·&nbsp; e.g. CAB-1234 / LC1234567890
                    </p>
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

              {/* Schedule Departure */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Schedule Departure</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Estimated Departure Date" required error={errors.departureDate}>
                    <TextInput type="date" value={lt.departureDate} onChange={(v) => setL("departureDate", v)} error={errors.departureDate} />
                  </Field>
                  <Field label="Estimated Departure Time" required error={errors.departureTime}>
                    <TextInput type="time" value={lt.departureTime} onChange={(v) => setL("departureTime", v)} error={errors.departureTime} />
                  </Field>
                  <Field label="Reason" className="md:col-span-2">
                    <SearchInput value={lt.reasonToOut} onChange={(v) => setL("reasonToOut", v)} placeholder="Search reason to out" />
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
                  <Field label="Select Approver" required error={errors.approver}>
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
                        value={cd.approver}
                        onChange={(v) => { setC("approver", v); void fetchLookup("approver", v); }}
                        onFocus={() => void fetchLookup("approver", cd.approver)}
                        placeholder="Search approver"
                        error={errors.approver}
                        options={lookupOptions.approver}
                      />
                    )}
                  </Field>

                  <Field label="Vehicles" required error={errors.vehicleDetails}>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <SearchInput
                          value={cd.vehicleSearch}
                          onChange={(v) => { setC("vehicleSearch", v); void fetchLookup("vehicle", v); }}
                          onFocus={() => void fetchLookup("vehicle", "")}
                          onSelect={(o) => {
                            const already = cdVehicles.find(v => v.vehicleNo === o.value);
                            if (!already) {
                              setCdVehicles(prev => [...prev, { vehicleNo: o.value, chassisNo: o.chassisNo ?? "" }]);
                              setErrors((p) => { const n = { ...p }; delete n.vehicleDetails; return n; });
                            }
                            setC("vehicleSearch", "");
                          }}
                          placeholder="Search and add vehicle..."
                          error={errors.vehicleDetails}
                          options={lookupOptions.vehicle}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBulkUpload(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold whitespace-nowrap"
                        style={{ background: "#5a9216" }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Bulk Upload
                      </button>
                    </div>
                    {/* Format hint */}
                    <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                      <span className="font-medium">Format:</span> Vehicle No / Chassis No &nbsp;·&nbsp; e.g. CAB-1234 / LC1234567890
                    </p>
                    {/* Chips */}
                    {cdVehicles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {cdVehicles.map((v, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                            style={{ background: "var(--surface2)", color: "var(--text)", borderColor: "var(--border)" }}
                          >
                            <span className="font-mono">{v.vehicleNo}{v.chassisNo ? ` / ${v.chassisNo}` : ""}</span>
                            <button
                              type="button"
                              onClick={() => setCdVehicles(prev => prev.filter((_, idx) => idx !== i))}
                              className="hover:text-red-500 transition-colors ml-0.5"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </Field>
                </div>
              </div>

              {/* Gate Out */}
              <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <SectionTitle>Gate Out from Dimo 800</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Estimated Departure Date" required error={errors.departureDate}>
                    <TextInput type="date" value={cd.departureDate} onChange={(v) => setC("departureDate", v)} error={errors.departureDate} />
                  </Field>
                  <Field label="Estimated Departure Time" required error={errors.departureTime}>
                    <TextInput type="time" value={cd.departureTime} onChange={(v) => setC("departureTime", v)} error={errors.departureTime} />
                  </Field>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Transportation Details — shared */}
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

          {(transportMode === "CARRIER" || transportMode === "DRIVER") && (
            <AnimatePresence mode="wait">
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {transportMode === "CARRIER" && (
                  <>
                    <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Carrier Details</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {/* Company Name — DB search, auto-fills reg no */}
                      <Field label="Company Name" required error={errors.companyName}>
                        <SearchInput
                          value={carrierFields.companyName}
                          onChange={(v) => { setCarrier("companyName", v); void fetchLookup("companyName", v); }}
                          onFocus={() => void fetchLookup("companyName", carrierFields.companyName)}
                          onSelect={(o) => {
                            setCarrier("companyName", o.value);
                            if (o.registrationNo) setCarrier("carrierRegNo", o.registrationNo);
                          }}
                          placeholder="Search company name"
                          error={errors.companyName}
                          options={lookupOptions.companyName}
                        />
                      </Field>
                      {/* Carrier Reg No — DB search, auto-fills company name */}
                      <Field label="Carrier Registration No" error={errors.carrierRegNo}>
                        <SearchInput
                          value={carrierFields.carrierRegNo}
                          onChange={(v) => { setCarrier("carrierRegNo", v); void fetchLookup("carrierRegNo", v); }}
                          onFocus={() => void fetchLookup("carrierRegNo", carrierFields.carrierRegNo)}
                          onSelect={(o) => {
                            setCarrier("carrierRegNo", o.value);
                            if (o.companyName) setCarrier("companyName", o.companyName);
                          }}
                          placeholder="Search carrier registration no"
                          options={lookupOptions.carrierRegNo}
                        />
                      </Field>
                    </div>
                  </>
                )}
                <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Driver Details</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="DL / NIC No" required error={errors.driverNIC}>
                    <TextInput value={carrierFields.driverNIC} onChange={(v) => setCarrier("driverNIC", v)} placeholder="e.g. 123456789V or 200012345678" nicOnly maxLength={12} error={errors.driverNIC} />
                  </Field>
                  <Field label="Driver Name" required error={errors.driverName}>
                    <TextInput value={carrierFields.driverName} onChange={(v) => setCarrier("driverName", v)} placeholder="Enter driver name" error={errors.driverName} />
                  </Field>
                  <Field label="Contact No">
                    <TextInput value={carrierFields.contactNo} onChange={(v) => setCarrier("contactNo", v)} placeholder="Enter driver contact no" numericOnly maxLength={10} />
                  </Field>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {(transportMode === "CUSTOMER" || transportMode === "OTHER") && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm py-3 px-4 rounded-xl" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              {transportMode === "CUSTOMER" ? "Customer will arrange own transport." : "Other transport arrangement."}
            </motion.p>
          )}
        </div>

        {/* Mileage / Additional Details */}
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

        {errors.form && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-600 bg-red-50 border border-red-200">{errors.form}</div>
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
