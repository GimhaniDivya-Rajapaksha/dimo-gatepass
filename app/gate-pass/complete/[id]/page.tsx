"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";

type DraftPass = {
  id: string;
  gatePassNumber: string;
  passType: string;
  gateDirection: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  vehicleColor: string | null;
  status: string;
  securityCreated: boolean;
  createdBy: { name: string };
};

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
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

function Input({ value, onChange, placeholder, disabled, error, className = "" }: {
  value: string; onChange?: (v: string) => void; placeholder?: string;
  disabled?: boolean; error?: string; className?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-4 py-2.5 rounded-xl border text-sm ${className}`}
      style={{
        background: disabled ? "var(--surface)" : "var(--surface2)",
        borderColor: error ? "#f87171" : "var(--border)",
        color: disabled ? "var(--text-muted)" : "var(--text)",
        opacity: disabled ? 0.7 : 1,
      }}
    />
  );
}

function Select({ value, onChange, children, error }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; error?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-4 py-2.5 rounded-xl border text-sm"
      style={{ background: "var(--surface2)", borderColor: error ? "#f87171" : "var(--border)", color: "var(--text)" }}
    >
      {children}
    </select>
  );
}

const LOCATIONS = [
  "Malmi Showroom", "Peliyagoda", "Ratnapura", "Kandy", "Galle",
  "Kurunegala", "Anuradhapura", "Badulla", "Matara", "Jaffna",
  "Negombo", "Batticaloa", "Trincomalee",
];

export default function CompletePassPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [pass, setPass] = useState<DraftPass | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Common fields
  const [toLocation, setToLocation] = useState("");
  const [fromLocation, setFromLocation] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [approver, setApprover] = useState("");
  const [approvers, setApprovers] = useState<{ id: string; name: string }[]>([]);
  const [outReason, setOutReason] = useState("");
  const [comments, setComments] = useState("");

  // After Sales specific
  const [passSubType, setPassSubType] = useState("MAIN_OUT");
  const [serviceJobNo, setServiceJobNo] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");

  const allowed = ["INITIATOR", "AREA_SALES_OFFICER", "SERVICE_ADVISOR"];

  useEffect(() => {
    if (status !== "loading" && !allowed.includes(session?.user?.role ?? "")) {
      router.replace("/");
    }
  }, [status, session, router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [passRes, approversRes] = await Promise.all([
          fetch(`/api/gate-pass/${id}`),
          fetch("/api/users?role=APPROVER"),
        ]);
        const passJson = await passRes.json();
        const approversData = await approversRes.json();
        // GET /api/gate-pass/[id] returns { gatePass: {...} }
        const passData = passJson.gatePass ?? passJson;
        if (!passRes.ok || passData.status !== "DRAFT") {
          router.replace("/gate-pass");
          return;
        }
        setPass(passData);
        setFromLocation(passData.fromLocation ?? "");
        setApprovers(approversData.users ?? []);
      } catch {
        setError("Failed to load gate pass");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id, router]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  if (error) return <div className="text-center py-24" style={{ color: "#dc2626" }}>{error}</div>;
  if (!pass) return <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>Pass not found</div>;

  function validate() {
    const e: Record<string, string> = {};
    if (pass!.passType !== "AFTER_SALES" || passSubType === "MAIN_OUT") {
      if (!departureDate) e.departureDate = "Departure date is required";
      if (!departureTime) e.departureTime = "Departure time is required";
    }
    if (pass!.passType === "LOCATION_TRANSFER") {
      if (!toLocation) e.toLocation = "Destination is required";
      if (!approver) e.approver = "Approver is required";
      if (!outReason) e.outReason = "Reason is required";
    }
    if (pass!.passType === "AFTER_SALES" && pass!.gateDirection === "IN") {
      if (!arrivalDate) e.arrivalDate = "Arrival date is required";
      if (!arrivalTime) e.arrivalTime = "Arrival time is required";
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/gate-pass/${id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toLocation:    toLocation || null,
          fromLocation:  fromLocation || null,
          departureDate: departureDate || null,
          departureTime: departureTime || null,
          arrivalDate:   arrivalDate || null,
          arrivalTime:   arrivalTime || null,
          approver:      approver || null,
          outReason:     outReason || null,
          comments:      comments || null,
          passSubType:   pass!.passType === "AFTER_SALES" ? passSubType : null,
          serviceJobNo:  serviceJobNo || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to complete pass"); return; }
      router.push(`/gate-pass/${id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const isAS  = pass.passType === "AFTER_SALES";
  const isLT  = pass.passType === "LOCATION_TRANSFER";
  const isCD  = pass.passType === "CUSTOMER_DELIVERY";
  const isIN  = pass.gateDirection === "IN";

  const passTypeLabel = isAS ? "After Sales" : isLT ? "Location Transfer" : "Customer Delivery";
  const dirLabel      = isIN ? "Gate IN" : "Gate OUT";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/gate-pass" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>← Gate Passes</Link>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Complete Gate Pass</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Fill in the remaining details for <strong>{pass.gatePassNumber}</strong> · created by Security Officer
        </p>
      </div>

      {/* Vehicle card — pre-filled, read-only */}
      <motion.div
        className="rounded-2xl border p-4 mb-5 flex items-center gap-4"
        style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#bfdbfe" }}>
          <svg className="w-5 h-5" style={{ color: "#1d4ed8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 1m0-7h8m0 0l2 4H5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-black font-mono tracking-wider" style={{ color: "#1d4ed8" }}>{pass.vehicle}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#1d4ed8", color: "#fff" }}>{passTypeLabel}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: isIN ? "#0f766e" : "#3730a3", color: "#fff" }}>{dirLabel}</span>
          </div>
          {pass.chassis && <p className="text-xs mt-0.5" style={{ color: "#3b82f6" }}>VIN: {pass.chassis}</p>}
          <p className="text-xs mt-0.5" style={{ color: "#93c5fd" }}>Created by Security · {pass.createdBy.name}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: "#fef9c3", color: "#92400e" }}>🔒 Vehicle pre-filled</span>
      </motion.div>

      <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-4">

        {/* After Sales sub-type */}
        {isAS && (
          <Field label="Pass Sub-Type" required>
            <Select value={passSubType} onChange={setPassSubType}>
              <option value="MAIN_OUT">Main OUT (vehicle leaving for service)</option>
              <option value="MAIN_IN">Main IN (vehicle returning from service)</option>
              <option value="SUB_OUT">Sub OUT</option>
              <option value="SUB_IN">Sub IN</option>
            </Select>
          </Field>
        )}

        {/* Service Job No */}
        {isAS && (
          <Field label="Service / Job Number">
            <Input value={serviceJobNo} onChange={setServiceJobNo} placeholder="e.g. SRV-2024-001" />
          </Field>
        )}

        {/* Locations */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="From Location">
            <Select value={fromLocation} onChange={setFromLocation}>
              <option value="">Select location…</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </Field>
          {(isLT || isAS) && (
            <Field label="To Location" required={isLT} error={errors.toLocation}>
              <Select value={toLocation} onChange={setToLocation} error={errors.toLocation}>
                <option value="">Select location…</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </Select>
            </Field>
          )}
        </div>

        {/* Approver (LT + CD) */}
        {(isLT || isCD) && (
          <Field label="Approver" required error={errors.approver}>
            <Select value={approver} onChange={setApprover} error={errors.approver}>
              <option value="">Select approver…</option>
              {approvers.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </Select>
          </Field>
        )}

        {/* Departure / Arrival dates */}
        {(!isAS || passSubType === "MAIN_OUT") && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={isIN ? "Arrival Date" : "Departure Date"} required error={errors.departureDate || errors.arrivalDate}>
              <Input
                value={isIN ? arrivalDate : departureDate}
                onChange={isIN ? setArrivalDate : setDepartureDate}
                error={errors.departureDate || errors.arrivalDate}
              />
              <input
                type="date"
                value={isIN ? arrivalDate : departureDate}
                onChange={e => isIN ? setArrivalDate(e.target.value) : setDepartureDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border text-sm"
                style={{ background: "var(--surface2)", borderColor: errors.departureDate ? "#f87171" : "var(--border)", color: "var(--text)" }}
              />
            </Field>
            <Field label={isIN ? "Arrival Time" : "Departure Time"} required error={errors.departureTime || errors.arrivalTime}>
              <input
                type="time"
                value={isIN ? arrivalTime : departureTime}
                onChange={e => isIN ? setArrivalTime(e.target.value) : setDepartureTime(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border text-sm"
                style={{ background: "var(--surface2)", borderColor: errors.departureTime ? "#f87171" : "var(--border)", color: "var(--text)" }}
              />
            </Field>
          </div>
        )}

        {/* Reason (LT) */}
        {isLT && (
          <Field label="Reason for Transfer" required error={errors.outReason}>
            <Input value={outReason} onChange={setOutReason} placeholder="e.g. Stocktaking, Customer request…" error={errors.outReason} />
          </Field>
        )}

        {/* Comments */}
        <Field label="Comments / Notes">
          <textarea
            value={comments}
            onChange={e => setComments(e.target.value)}
            placeholder="Any additional notes…"
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border text-sm resize-none"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </Field>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Link href="/gate-pass"
            className="flex-1 py-3 rounded-xl text-sm font-bold text-center border transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface2)" }}>
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
          >
            {submitting
              ? <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                  Submitting…
                </span>
              : "Submit & Send for Approval"
            }
          </button>
        </div>
      </form>
    </div>
  );
}
