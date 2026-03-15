"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";

type SubOut = {
  id: string;
  gatePassNumber: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  vehicleColor: string | null;
  serviceJobNo: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  requestedBy: string | null;
  departureDate: string | null;
  createdBy: { name: string };
  parentPass: {
    id: string;
    gatePassNumber: string;
    serviceJobNo: string | null;
    vehicle: string;
    chassis: string | null;
    make: string | null;
    vehicleColor: string | null;
    requestedBy: string | null;
  } | null;
};

interface Props {
  subOut: SubOut;
  user: { name?: string | null; role: string | null; defaultLocation?: string | null };
}

type FieldKey = "vehicle" | "chassis" | "make" | "vehicleColor" | "serviceJobNo" | "fromLocation" | "toLocation" | "requestedBy";

const FIELD_LABELS: Record<FieldKey, string> = {
  vehicle: "Vehicle",
  chassis: "Chassis No",
  make: "Make",
  vehicleColor: "Color",
  serviceJobNo: "Service Job No",
  fromLocation: "From Location",
  toLocation: "To Location",
  requestedBy: "Requested By",
};

export default function CreateSubInClient({ subOut, user }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  // Pre-fill from SUB_OUT, fall back to parent pass fields
  const orig: Record<FieldKey, string> = {
    vehicle: subOut.vehicle || subOut.parentPass?.vehicle || "",
    chassis: subOut.chassis || subOut.parentPass?.chassis || "",
    make: subOut.make || subOut.parentPass?.make || "",
    vehicleColor: subOut.vehicleColor || subOut.parentPass?.vehicleColor || "",
    serviceJobNo: subOut.serviceJobNo || subOut.parentPass?.serviceJobNo || "",
    fromLocation: subOut.fromLocation || "",
    toLocation: subOut.toLocation || "",
    requestedBy: subOut.requestedBy || subOut.parentPass?.requestedBy || "",
  };

  const [form, setForm] = useState<Record<FieldKey, string>>({ ...orig });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect which fields changed
  const changedFields = (Object.keys(orig) as FieldKey[]).filter(
    (k) => form[k].trim() !== (orig[k] || "").trim()
  );
  const hasChanges = changedFields.length > 0;

  // Auto-generate change description
  const autoDescription = changedFields
    .map((k) => `${FIELD_LABELS[k]}: "${orig[k] || "—"}" → "${form[k] || "—"}"`)
    .join("\n");

  const commentRequired = hasChanges;
  const commentValid = !commentRequired || comment.trim().length > 0;

  function setField(k: FieldKey, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (commentRequired && !commentValid) {
      setError("Please add a comment explaining what you changed.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const now = new Date();
    const time = now.toTimeString().slice(0, 5);
    const fullComment = autoDescription
      ? `[Changes made]\n${autoDescription}${comment.trim() ? `\n\nNote: ${comment.trim()}` : ""}`
      : comment.trim() || null;

    try {
      // Step 1: Create SUB_IN
      const createRes = await fetch("/api/gate-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passType: "AFTER_SALES",
          passSubType: "SUB_IN",
          parentPassId: subOut.parentPass?.id || null,
          vehicle: form.vehicle,
          chassis: form.chassis || null,
          make: form.make || null,
          vehicleColor: form.vehicleColor || null,
          serviceJobNo: form.serviceJobNo || null,
          fromLocation: form.fromLocation || null,
          toLocation: form.toLocation || null,
          requestedBy: form.requestedBy || null,
          departureDate: today,
          departureTime: time,
          comments: fullComment,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error ?? "Failed to create SUB IN pass.");
        return;
      }

      const subInId = createData.gatePass?.id;
      if (!subInId) { setError("SUB IN created but ID missing."); return; }

      // Step 2: Mark as IN (gate_out action)
      const markRes = await fetch(`/api/gate-pass/${subInId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gate_out" }),
      });

      if (!markRes.ok) {
        const d = await markRes.json();
        setError(`SUB IN created but failed to mark as IN: ${d.error ?? "Unknown error"}`);
        return;
      }

      router.push("/aso");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Back link */}
      <Link href="/initiator" className="inline-flex items-center gap-1.5 text-sm mb-5 hover:underline" style={{ color: "var(--text-muted)" }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1" style={{ color: "var(--lime)" }}>After Sales</p>
        <h1 className="text-2xl font-bold gradient-text title-font">Create SUB IN Pass</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Pre-filled from SUB OUT <span className="font-mono font-bold" style={{ color: "#1d4ed8" }}>{subOut.gatePassNumber}</span>.
          Edit if needed — a comment is required for any changes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Reference card */}
        <div className="rounded-xl border px-4 py-3 flex items-center gap-3" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#dbeafe" }}>
            <svg className="w-4 h-4" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 8h4l3 3v5h-7V8z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>SUB OUT Reference</p>
            <p className="font-bold text-sm" style={{ color: "var(--text)" }}>
              {subOut.gatePassNumber} — by {subOut.createdBy.name}
            </p>
            {subOut.parentPass && (
              <p className="text-xs mt-0.5" style={{ color: "#3b82f6" }}>
                Parent: {subOut.parentPass.gatePassNumber}
                {subOut.parentPass.serviceJobNo && ` · Job ${subOut.parentPass.serviceJobNo}`}
              </p>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Vehicle Details</p>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-4">
            {(["vehicle", "chassis", "make", "vehicleColor", "serviceJobNo", "requestedBy"] as FieldKey[]).map((k) => {
              const changed = form[k].trim() !== (orig[k] || "").trim();
              return (
                <div key={k} className={k === "vehicle" || k === "requestedBy" ? "col-span-2" : ""}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: changed ? "#b45309" : "var(--text-muted)" }}>
                    {FIELD_LABELS[k]}
                    {changed && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#fef3c7", color: "#b45309" }}>EDITED</span>}
                  </label>
                  <input
                    type="text"
                    value={form[k]}
                    onChange={(e) => setField(k, e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{
                      background: changed ? "#fffbeb" : "var(--surface2)",
                      borderColor: changed ? "#f59e0b" : "var(--border)",
                      color: "var(--text)",
                    }}
                    placeholder={orig[k] || `Enter ${FIELD_LABELS[k]}`}
                  />
                  {changed && (
                    <p className="text-[10px] mt-1" style={{ color: "#92400e" }}>
                      Original: {orig[k] || "—"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Locations */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Locations</p>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-4">
            {(["fromLocation", "toLocation"] as FieldKey[]).map((k) => {
              const changed = form[k].trim() !== (orig[k] || "").trim();
              return (
                <div key={k}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: changed ? "#b45309" : "var(--text-muted)" }}>
                    {FIELD_LABELS[k]}
                    {changed && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#fef3c7", color: "#b45309" }}>EDITED</span>}
                  </label>
                  <input
                    type="text"
                    value={form[k]}
                    onChange={(e) => setField(k, e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{
                      background: changed ? "#fffbeb" : "var(--surface2)",
                      borderColor: changed ? "#f59e0b" : "var(--border)",
                      color: "var(--text)",
                    }}
                    placeholder={orig[k] || `Enter ${FIELD_LABELS[k]}`}
                  />
                  {changed && (
                    <p className="text-[10px] mt-1" style={{ color: "#92400e" }}>
                      Original: {orig[k] || "—"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Changes summary */}
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border px-4 py-3"
            style={{ background: "#fffbeb", borderColor: "#f59e0b66" }}
          >
            <p className="text-xs font-bold mb-1.5" style={{ color: "#b45309" }}>
              {changedFields.length} field{changedFields.length !== 1 ? "s" : ""} edited — comment required below
            </p>
            <div className="text-xs space-y-0.5 font-mono" style={{ color: "#92400e" }}>
              {changedFields.map((k) => (
                <div key={k}>{FIELD_LABELS[k]}: "{orig[k] || "—"}" → "{form[k] || "—"}"</div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Comment */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: commentRequired ? "#b45309" : "var(--text-muted)" }}>
            Comment
            {commentRequired
              ? <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#fee2e2", color: "#dc2626" }}>REQUIRED — fields were edited</span>
              : <span className="ml-1 font-normal opacity-60">(optional)</span>
            }
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={hasChanges
              ? "Explain why you changed the above field(s)..."
              : "Any notes about vehicle condition, arrival details..."}
            className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{
              background: "var(--surface2)",
              borderColor: commentRequired && !commentValid ? "#ef4444" : "var(--border)",
              color: "var(--text)",
            }}
          />
          {commentRequired && !commentValid && (
            <p className="text-xs mt-1 font-semibold" style={{ color: "#ef4444" }}>
              Comment is required when fields are edited.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border px-4 py-3" style={{ background: "#fee2e2", borderColor: "#fca5a5" }}>
            <p className="text-sm font-semibold" style={{ color: "#dc2626" }}>{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || (commentRequired && !commentValid)}
          className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#065f46,#059669)" }}
        >
          {submitting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Creating &amp; Marking as IN…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />
              </svg>
              Create SUB IN &amp; Mark as IN
            </>
          )}
        </button>
      </form>
    </div>
  );
}
