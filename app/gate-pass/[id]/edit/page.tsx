"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DatePicker from "@/components/ui/DatePicker";
import TimePicker from "@/components/ui/TimePicker";

type LookupOption = { id: string; value: string; label: string; [key: string]: string };

/* ─── Shared UI ────────────────────────────────────────────────────────────── */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>{children}</p>;
}

/** Dropdown that pre-loads all options and filters by typing */
function PreloadedDropdown({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: LookupOption[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  // Keep query in sync when value changes externally
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <input
        type="text" value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Select..."}
        className="w-full border rounded-xl px-4 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border shadow-2xl overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)", maxHeight: 240, overflowY: "auto" }}>
          {filtered.length === 0
            ? <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>No results</p>
            : filtered.map(o => (
              <button key={o.id} type="button"
                onMouseDown={() => { onChange(o.value); setQuery(o.label); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
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
                <span className="truncate">{o.label}</span>
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}

/** Dropdown that fetches on demand as user types */
function SearchDropdown({ value, onChange, onSelect, placeholder, fetchUrl }: {
  value: string; onChange: (v: string) => void;
  onSelect: (o: LookupOption) => void;
  placeholder?: string; fetchUrl: (q: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LookupOption[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setOptions([]); return; }
    timer.current = setTimeout(() => {
      fetch(fetchUrl(q)).then(r => r.json())
        .then((d: { options?: LookupOption[] }) => setOptions(d.options ?? []));
    }, 250);
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <input type="text" value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); search(e.target.value); }}
        onFocus={() => { setOpen(true); if (value) search(value); }}
        placeholder={placeholder ?? "Search..."}
        className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      {open && options.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border shadow-2xl overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)", maxHeight: 220, overflowY: "auto" }}>
          {options.map(o => (
            <button key={o.id} type="button"
              onMouseDown={() => { onSelect(o); setOpen(false); setOptions([]); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
              style={{ color: "var(--text)" }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────────── */
export default function EditPendingGatePassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [gp, setGp] = useState<Record<string, unknown>>({});

  /* pre-loaded options */
  const [approverOptions, setApproverOptions]   = useState<LookupOption[]>([]);
  const [locationOptions, setLocationOptions]   = useState<LookupOption[]>([]);
  const [outReasonOptions, setOutReasonOptions] = useState<LookupOption[]>([]);

  /* form fields */
  const [approver,      setApprover]      = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [toLocation,    setToLocation]    = useState("");
  const [outReason,     setOutReason]     = useState("");
  const [requestedBy,   setRequestedBy]   = useState("");
  const [transportMode, setTransportMode] = useState("");
  const [companyName,   setCompanyName]   = useState("");
  const [carrierRegNo,  setCarrierRegNo]  = useState("");
  const [driverName,    setDriverName]    = useState("");
  const [driverNIC,     setDriverNIC]     = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [mileage,       setMileage]       = useState("");
  const [insurance,     setInsurance]     = useState("");
  const [garagePlate,   setGaragePlate]   = useState("");
  const [reason,        setReason]        = useState("");

  /* Load gate pass + all lookup options in parallel */
  useEffect(() => {
    Promise.all([
      fetch(`/api/gate-pass/${id}`).then(r => r.json()),
      fetch(`/api/me`).then(r => r.json()),
      fetch(`/api/lookups?field=location&limit=500`).then(r => r.json()),
      fetch(`/api/lookups?field=outReason&limit=100`).then(r => r.json()),
    ]).then(([gpData, meData, locData, orData]) => {
      const p = (gpData as { gatePass?: Record<string, unknown> }).gatePass ?? {};
      setGp(p);
      setApprover((p.intendedApprover as string) ?? "");
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

      // Assigned approvers only
      const me = (meData as { user?: { approver?: { id: string; name: string } | null; backupApprover?: { id: string; name: string } | null } }).user;
      const opts: LookupOption[] = [];
      if (me?.approver)       opts.push({ id: me.approver.id,       value: me.approver.name,       label: me.approver.name });
      if (me?.backupApprover) opts.push({ id: me.backupApprover.id, value: me.backupApprover.name, label: me.backupApprover.name });
      setApproverOptions(opts);

      // Locations
      const locs = (locData as { options?: LookupOption[] }).options ?? [];
      setLocationOptions(locs.map(o => ({ ...o, label: o.label || o.value })));

      // Out reasons
      const ors = (orData as { options?: LookupOption[] }).options ?? [];
      setOutReasonOptions(ors);
    }).finally(() => setPageLoading(false));
  }, [id]);

  async function handleSubmit() {
    if (!approver.trim()) { setError("Approver is required"); return; }
    if (!reason.trim())   { setError("Reason for change is required"); return; }
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

  if (pageLoading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-8 h-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
    </div>
  );

  const role = session?.user?.role;
  if (role !== "INITIATOR" && role !== "AREA_SALES_OFFICER") {
    return <div className="p-8 text-center text-red-500">Access denied</div>;
  }

  const isCarrier = transportMode === "CARRIER";
  const sectionCard = "rounded-2xl border p-6 mb-5";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all"
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

      {/* Vehicle — locked */}
      <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <SectionTitle>Vehicle (Locked)</SectionTitle>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Vehicle No</p>
            <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{gp.vehicle as string}</p>
          </div>
          <div>
            <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Chassis No</p>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{(gp.chassis as string) || "—"}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#fef9c3", color: "#92400e" }}>LOCKED</span>
            </div>
          </div>
          {!!(gp.make as string) && <div><p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Make</p><p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.make as string}</p></div>}
          {!!(gp.vehicleColor as string) && <div><p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Colour</p><p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.vehicleColor as string}</p></div>}
        </div>
      </div>

      {/* Approver */}
      <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <SectionTitle>Approver</SectionTitle>
        <Field label="Approver" required>
          <PreloadedDropdown
            value={approver}
            onChange={setApprover}
            options={approverOptions}
            placeholder="Select approver..."
          />
        </Field>
      </div>

      {/* Details */}
      <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <SectionTitle>Details</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Departure Date">
              <DatePicker value={departureDate} onChange={setDepartureDate} />
            </Field>
            <Field label="Departure Time">
              <TimePicker value={departureTime} onChange={setDepartureTime} />
            </Field>
          </div>
          <Field label="To Location">
            <PreloadedDropdown
              value={toLocation}
              onChange={setToLocation}
              options={locationOptions}
              placeholder="Select location..."
            />
          </Field>
          <Field label="Out Reason">
            <PreloadedDropdown
              value={outReason}
              onChange={setOutReason}
              options={outReasonOptions}
              placeholder="Select reason..."
            />
          </Field>
          <Field label="Requested By">
            <input type="text" value={requestedBy} onChange={e => setRequestedBy(e.target.value)}
              placeholder="Name of person who requested..."
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
          </Field>
        </div>
      </div>

      {/* Transportation */}
      <div className={sectionCard} style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <SectionTitle>Transportation</SectionTitle>
        <div className="space-y-4">
          <Field label="Transport Mode">
            <div className="flex gap-2 flex-wrap">
              {(["CARRIER", "DRIVER", "CUSTOMER", "OTHER"] as const).map(m => (
                <button key={m} type="button" onClick={() => setTransportMode(m)}
                  className="px-4 py-2 rounded-xl text-sm font-medium border transition-all"
                  style={{
                    background: transportMode === m ? "#1d4ed8" : "var(--surface2)",
                    color: transportMode === m ? "#fff" : "var(--text)",
                    borderColor: transportMode === m ? "#1d4ed8" : "var(--border)",
                  }}>
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </Field>

          {isCarrier && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Company Name">
                  <SearchDropdown
                    value={companyName}
                    onChange={setCompanyName}
                    placeholder="Search company name..."
                    fetchUrl={q => `/api/lookups?field=companyName&q=${encodeURIComponent(q)}&limit=15`}
                    onSelect={o => { setCompanyName(o.value); if (o.registrationNo) setCarrierRegNo(o.registrationNo); }}
                  />
                </Field>
                <Field label="Carrier Reg No">
                  <SearchDropdown
                    value={carrierRegNo}
                    onChange={setCarrierRegNo}
                    placeholder="Search reg no..."
                    fetchUrl={q => `/api/lookups?field=carrierRegNo&q=${encodeURIComponent(q)}&limit=15`}
                    onSelect={o => { setCarrierRegNo(o.value); if (o.companyName) setCompanyName(o.companyName); }}
                  />
                </Field>
              </div>
              {/* Driver Details */}
              <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-semibold mb-3" style={{ color: "var(--text)" }}>Driver Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="DL / NIC No">
                    <SearchDropdown
                      value={driverNIC}
                      onChange={setDriverNIC}
                      placeholder="Search NIC / DL..."
                      fetchUrl={q => `/api/lookups?field=driverNIC&q=${encodeURIComponent(q)}&limit=15`}
                      onSelect={o => { setDriverNIC(o.value); if (o.driverName) setDriverName(o.driverName); if (o.driverContact) setDriverContact(o.driverContact); }}
                    />
                  </Field>
                  <Field label="Driver Name">
                    <SearchDropdown
                      value={driverName}
                      onChange={setDriverName}
                      placeholder="Search driver name..."
                      fetchUrl={q => `/api/lookups?field=driverName&q=${encodeURIComponent(q)}&limit=15`}
                      onSelect={o => { setDriverName(o.value); if (o.driverNIC) setDriverNIC(o.driverNIC); if (o.driverContact) setDriverContact(o.driverContact); }}
                    />
                  </Field>
                  <Field label="Driver Contact">
                    <input type="text" value={driverContact} onChange={e => setDriverContact(e.target.value)}
                      placeholder="Contact number..."
                      className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                  </Field>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {([
              ["Mileage (km)", mileage, setMileage, "e.g. 45000"],
              ["Insurance", insurance, setInsurance, "Insurance details..."],
              ["Garage / Trade Plate", garagePlate, setGaragePlate, "Plate number..."],
            ] as [string, string, (v: string) => void, string][]).map(([lbl, val, set, ph]) => (
              <Field key={lbl} label={lbl}>
                <input type="text" value={val} onChange={e => set(e.target.value)} placeholder={ph}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
              </Field>
            ))}
          </div>
        </div>
      </div>

      {/* Reason for change — required */}
      <div className={sectionCard} style={{ background: "#eff6ff", borderColor: "#93c5fd" }}>
        <SectionTitle>Reason for Change</SectionTitle>
        <Field label="Why are you editing this gate pass?" required>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Original approver is not available today..."
            className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            style={{ background: "white", borderColor: "#93c5fd", color: "var(--text)" }} />
        </Field>
        <p className="text-xs mt-2" style={{ color: "#1d4ed8" }}>
          Visible to both the original and new approver.
        </p>
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-4 px-4 py-3 rounded-xl" style={{ background: "#fef2f2" }}>{error}</p>
      )}

      <div className="flex gap-3 pb-8">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-3 rounded-xl text-sm font-semibold border transition-all"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
          Cancel
        </button>
        <button type="button" onClick={() => void handleSubmit()} disabled={submitting}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: submitting ? "#93c5fd" : "#2563eb", cursor: submitting ? "not-allowed" : "pointer" }}>
          {submitting ? "Saving..." : "Save & Reassign"}
        </button>
      </div>
    </div>
  );
}
