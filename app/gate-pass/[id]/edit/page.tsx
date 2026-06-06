"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DatePicker from "@/components/ui/DatePicker";
import TimePicker from "@/components/ui/TimePicker";

type LookupOption = { id: string; value: string; label: string; [key: string]: string };

function Field({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function ApproverDropdown({ value, onChange, allOptions }: {
  value: string;
  onChange: (v: string) => void;
  allOptions: LookupOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = { current: null as HTMLDivElement | null };

  const filtered = query
    ? allOptions.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : allOptions;

  return (
    <div className="relative" ref={(el) => { ref.current = el; }}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Select approver..."
        className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      {/* Dropdown arrow */}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border shadow-xl overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)", maxHeight: "220px", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>No approvers found</p>
          ) : filtered.map((o) => (
            <button key={o.id} type="button"
              onMouseDown={() => { onChange(o.value); setQuery(o.label); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2"
              style={{
                color: "var(--text)",
                background: value === o.value ? "#eff6ff" : "transparent",
                fontWeight: value === o.value ? 600 : 400,
              }}>
              {value === o.value && (
                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchDropdown({ value, onChange, onSelect, options, loading, placeholder }: {
  value: string; onChange: (v: string) => void; onSelect: (o: LookupOption) => void;
  options: LookupOption[]; loading?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <input type="text" value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
        className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border shadow-xl overflow-hidden max-h-48 overflow-y-auto"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {options.map((o) => (
            <button key={o.id} type="button" onMouseDown={() => { onSelect(o); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
              style={{ color: "var(--text)" }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {loading && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Searching...</p>}
    </div>
  );
}

export default function EditPendingGatePassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [gp, setGp] = useState<Record<string, string | null | boolean>>({});

  // Form fields
  const [approver, setApprover] = useState("");
  const [approverOptions, setApproverOptions] = useState<LookupOption[]>([]);
  const [reason, setReason] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [toLocationOptions, setToLocationOptions] = useState<LookupOption[]>([]);
  const [outReason, setOutReason] = useState("");
  const [outReasonOptions, setOutReasonOptions] = useState<LookupOption[]>([]);
  const [requestedBy, setRequestedBy] = useState("");
  const [transportMode, setTransportMode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [carrierRegNo, setCarrierRegNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverNIC, setDriverNIC] = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [mileage, setMileage] = useState("");
  const [insurance, setInsurance] = useState("");
  const [garagePlate, setGaragePlate] = useState("");

  // Load all approvers on mount
  useEffect(() => {
    fetch(`/api/lookups?field=approver&limit=100`)
      .then(r => r.json())
      .then((d: { options?: LookupOption[] }) => setApproverOptions(d.options ?? []));
  }, []);

  useEffect(() => {
    fetch(`/api/gate-pass/${id}`)
      .then(r => r.json())
      .then((d: { gatePass?: Record<string, string | null | boolean> }) => {
        const p = d.gatePass ?? {};
        setGp(p);
        setApprover((p.intendedApprover as string) ?? (p.approver as string) ?? "");
        setDepartureDate((p.departureDate as string) ?? "");
        setDepartureTime((p.departureTime as string) ?? "");
        setToLocation((p.toLocation as string) ?? "");
        setOutReason((p.outReason as string) ?? "");
        setRequestedBy((p.requestedBy as string) ?? "");
        setTransportMode((p.transportMode as string) ?? "");
        setCompanyName((p.companyName as string) ?? "");
        setCarrierRegNo((p.carrierRegNo as string) ?? "");
        setDriverName((p.driverName as string) ?? "");
        setDriverNIC((p.driverNIC as string) ?? "");
        setDriverContact((p.driverContact as string) ?? "");
        setMileage((p.mileage as string) ?? "");
        setInsurance((p.insurance as string) ?? "");
        setGaragePlate((p.garagePlate as string) ?? "");
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit() {
    if (!approver.trim()) { setError("Approver is required"); return; }
    if (!reason.trim()) { setError("Reason for change is required"); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`/api/gate-pass/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "initiator_reassign",
          newApprover: approver, reason,
          departureDate, departureTime, toLocation, outReason, requestedBy,
          transportMode, companyName, carrierRegNo, driverName, driverNIC,
          driverContact, mileage, insurance, garagePlate,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { error?: string }).error ?? "Failed"); }
      router.push("/gate-pass");
    } catch (e) { setError(String(e)); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>Loading...</div>;

  const role = session?.user?.role;
  if (role !== "INITIATOR" && role !== "AREA_SALES_OFFICER") {
    return <div className="p-8 text-center text-red-500">Access denied</div>;
  }

  const isCarrier = transportMode === "CARRIER";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center border"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Edit Gate Pass</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{gp.gatePassNumber as string}</p>
        </div>
      </div>

      {/* Vehicle info — locked */}
      <div className="rounded-2xl border p-5 mb-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Vehicle (locked)</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Vehicle No</p>
            <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{gp.vehicle as string}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chassis No</p>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{(gp.chassis as string) || "—"}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#fef9c3", color: "#92400e" }}>LOCKED</span>
            </div>
          </div>
          {gp.make && <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Make</p><p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.make as string}</p></div>}
          {gp.vehicleColor && <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Colour</p><p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.vehicleColor as string}</p></div>}
        </div>
      </div>

      {/* Approver dropdown */}
      <div className="rounded-2xl border p-5 mb-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Approver</p>
        <Field label="Approver" required>
          <ApproverDropdown
            value={approver}
            onChange={setApprover}
            allOptions={approverOptions}
          />
        </Field>
      </div>

      <div className="rounded-2xl border p-5 mb-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Details</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Departure Date">
            <DatePicker value={departureDate} onChange={setDepartureDate} />
          </Field>
          <Field label="Departure Time">
            <TimePicker value={departureTime} onChange={setDepartureTime} />
          </Field>
        </div>
        <Field label="To Location">
          <SearchDropdown
            value={toLocation}
            onChange={(v) => {
              setToLocation(v);
              if (!v) { setToLocationOptions([]); return; }
              fetch(`/api/lookups?field=location&q=${encodeURIComponent(v)}&limit=15`)
                .then(r => r.json())
                .then((d: { options?: LookupOption[] }) => setToLocationOptions(d.options ?? []));
            }}
            onSelect={(o) => { setToLocation(o.label); setToLocationOptions([]); }}
            options={toLocationOptions}
            placeholder="Search location..."
          />
        </Field>
        <Field label="Out Reason">
          <SearchDropdown
            value={outReason}
            onChange={(v) => {
              setOutReason(v);
              if (!v) { setOutReasonOptions([]); return; }
              fetch(`/api/lookups?field=outReason&q=${encodeURIComponent(v)}&limit=15`)
                .then(r => r.json())
                .then((d: { options?: LookupOption[] }) => setOutReasonOptions(d.options ?? []));
            }}
            onSelect={(o) => { setOutReason(o.value); setOutReasonOptions([]); }}
            options={outReasonOptions}
            placeholder="Search reason..."
          />
        </Field>
        <Field label="Requested By">
          <input type="text" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)}
            placeholder="Name of person who requested..."
            className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
        </Field>
      </div>

      <div className="rounded-2xl border p-5 mb-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Transportation</p>
        <Field label="Transport Mode">
          <div className="flex gap-2 flex-wrap">
            {["CARRIER", "DRIVER", "CUSTOMER", "OTHER"].map((m) => (
              <button key={m} type="button" onClick={() => setTransportMode(m)}
                className="px-4 py-2 rounded-xl text-sm font-medium border transition-all"
                style={{ background: transportMode === m ? "#1d4ed8" : "var(--surface2)", color: transportMode === m ? "#fff" : "var(--text)", borderColor: transportMode === m ? "#1d4ed8" : "var(--border)" }}>
                {m.charAt(0) + m.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </Field>
        {isCarrier && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Name"><input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Carrier company..." className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
            <Field label="Carrier Reg No"><input type="text" value={carrierRegNo} onChange={(e) => setCarrierRegNo(e.target.value)} placeholder="Registration number..." className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
            <Field label="Driver Name"><input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name..." className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
            <Field label="Driver NIC"><input type="text" value={driverNIC} onChange={(e) => setDriverNIC(e.target.value)} placeholder="NIC number..." className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
            <Field label="Driver Contact"><input type="text" value={driverContact} onChange={(e) => setDriverContact(e.target.value)} placeholder="Contact number..." className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Mileage (km)"><input type="text" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="e.g. 45000" className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
          <Field label="Insurance"><input type="text" value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="Insurance details..." className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
          <Field label="Garage / Trade Plate"><input type="text" value={garagePlate} onChange={(e) => setGaragePlate(e.target.value)} placeholder="Plate number..." className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} /></Field>
        </div>
      </div>

      {/* Reason — required */}
      <div className="rounded-2xl border p-5 mb-6" style={{ background: "#eff6ff", borderColor: "#93c5fd" }}>
        <Field label="Reason for Change" required>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Original approver is not available today..."
            className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            style={{ background: "white", borderColor: "#93c5fd", color: "var(--text)" }} />
        </Field>
        <p className="text-xs mt-2" style={{ color: "#1d4ed8" }}>This reason will be visible to both the original and new approver.</p>
      </div>

      {error && <p className="text-red-500 text-sm mb-4 px-4 py-3 rounded-xl" style={{ background: "#fef2f2" }}>{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-3 rounded-xl text-sm font-semibold border"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
          Cancel
        </button>
        <button type="button" onClick={() => void handleSubmit()} disabled={submitting}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: submitting ? "#93c5fd" : "#2563eb", cursor: submitting ? "not-allowed" : "pointer" }}>
          {submitting ? "Saving..." : "Save & Reassign"}
        </button>
      </div>
    </div>
  );
}
