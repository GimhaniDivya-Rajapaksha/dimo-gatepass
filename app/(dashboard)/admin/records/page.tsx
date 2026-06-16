"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────
type Record_ = {
  id: string;
  gatePassNumber: string;
  passType: string;
  passSubType: string | null;
  status: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  createdAt: string;
  createdBy: { name: string; email: string } | null;
  approvedBy: { name: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(date: string | null, time: string | null) {
  if (!date) return "—";
  return time ? `${date} ${time}` : date;
}

const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_APPROVAL: { label: "Pending",    bg: "#fef9c3", color: "#854d0e" },
  APPROVED:         { label: "Approved",   bg: "#dcfce7", color: "#166534" },
  REJECTED:         { label: "Rejected",   bg: "#fee2e2", color: "#dc2626" },
  GATE_OUT:         { label: "Gate Out",   bg: "#dbeafe", color: "#1e40af" },
  INITIATOR_OUT:    { label: "Init. Out",  bg: "#e0f2fe", color: "#0369a1" },
  INITIATOR_IN:     { label: "Init. In",   bg: "#d1fae5", color: "#065f46" },
  COMPLETED:        { label: "Completed",  bg: "#f0fdf4", color: "#15803d" },
  CANCELLED:        { label: "Cancelled",  bg: "#f3f4f6", color: "#6b7280" },
  CASHIER_REVIEW:   { label: "Cashier Review", bg: "#fdf4ff", color: "#7e22ce" },
  DRAFT:            { label: "Draft",      bg: "#f3f4f6", color: "#374151" },
};

const passTypeCfg: Record<string, { label: string; bg: string; color: string }> = {
  LOCATION_TRANSFER: { label: "Location Transfer", bg: "#dbeafe", color: "#1e40af" },
  CUSTOMER_DELIVERY: { label: "Customer Delivery",  bg: "#dcfce7", color: "#166534" },
  AFTER_SALES:       { label: "After Sales",         bg: "#fdf4ff", color: "#7e22ce" },
};

// ── Page ───────────────────────────────────────────────────────────────────
export default function AdminRecordsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const today = new Date().toISOString().split("T")[0];

  const [chassis,  setChassis]  = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate,   setToDate]   = useState(today);
  const [records,  setRecords]  = useState<Record_[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState("");

  // SAP cross-check state
  type CrossCheckRow = {
    vehicle: string; chassis: string | null;
    systemLocation: string; sapLocation: string | null;
    match: boolean | null; notInSap?: boolean; sapError?: boolean;
  };
  const [crossCheck,        setCrossCheck]        = useState<CrossCheckRow[]>([]);
  const [crossCheckLoading, setCrossCheckLoading] = useState(false);
  const [crossCheckError,   setCrossCheckError]   = useState("");

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status === "authenticated" && (session as any)?.user?.role !== "ADMIN") router.replace("/");
  }, [status, session, router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!chassis.trim() && !fromDate && !toDate) {
      setError("Enter at least a chassis number or a date range.");
      return;
    }
    setError("");
    setLoading(true);
    setSearched(false);
    try {
      const params = new URLSearchParams();
      if (chassis.trim()) params.set("chassis", chassis.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate)   params.set("to",   toDate);
      const res  = await fetch(`/api/admin/records?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to fetch records. Please try again.");
        return;
      }
      setRecords(json.records ?? []);
      setSearched(true);

      // Trigger SAP cross-check in parallel
      setCrossCheck([]);
      setCrossCheckError("");
      setCrossCheckLoading(true);
      fetch(`/api/admin/sap-crosscheck?${params}`)
        .then(r => r.json())
        .then(j => { setCrossCheck(j.results ?? []); })
        .catch(() => { setCrossCheckError("Could not reach SAP. Cross-check unavailable."); })
        .finally(() => setCrossCheckLoading(false));
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setChassis("");
    setFromDate(today);
    setToDate(today);
    setRecords([]);
    setSearched(false);
    setError("");
    setCrossCheck([]);
    setCrossCheckError("");
  }

  if (status === "loading") return null;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Gate Pass Records</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Search gate pass records by date range and / or chassis number
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch}
        className="rounded-2xl border p-5 mb-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex flex-wrap gap-4 items-end">
          {/* Chassis */}
          <div className="flex flex-col gap-1.5 min-w-[200px]">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Chassis No.
            </label>
            <input
              type="text"
              value={chassis}
              onChange={e => setChassis(e.target.value)}
              placeholder="e.g. WDD2026060…"
              className="px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)", minWidth: "220px" }}
            />
          </div>

          {/* From date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* To date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button type="submit" disabled={loading}
              className="px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
              style={{ background: "var(--accent)", color: "#fff" }}>
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
              )}
              {loading ? "Searching…" : "Search"}
            </button>
            <button type="button" onClick={handleReset}
              className="px-4 py-2 rounded-xl text-sm font-medium border transition-all"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Reset
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm" style={{ color: "#dc2626" }}>{error}</p>
        )}
      </form>

      {/* Results */}
      {searched && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {/* Result count bar */}
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {records.length === 0
                ? "No records found"
                : `${records.length} record${records.length !== 1 ? "s" : ""} found${records.length === 200 ? " (showing first 200)" : ""}`}
            </span>
          </div>

          {records.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No gate passes match your search criteria</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Gate Pass", "Type", "Status", "Vehicle", "Chassis", "Journey (From → To)", "Departure", "Arrival", "Created By", "Approved By", "Created On"].map((h, i) => (
                      <th key={i}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: "var(--text-muted)", position: "sticky", top: 0, background: "var(--surface2)", zIndex: 10 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => {
                    const sc  = statusCfg[r.status]   ?? { label: r.status,   bg: "#f3f4f6", color: "#374151" };
                    const ptc = passTypeCfg[r.passType] ?? { label: r.passType, bg: "#f3f4f6", color: "#374151" };
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        {/* Gate Pass */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/gate-pass/${r.id}`}
                            className="font-mono font-bold text-xs hover:underline"
                            style={{ color: "var(--accent)" }}>
                            {r.gatePassNumber}
                          </Link>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: ptc.bg, color: ptc.color }}>
                            {ptc.label}
                          </span>
                          {r.passSubType && (
                            <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ background: "#f3f4f6", color: "#374151" }}>
                              {r.passSubType.replace("_", " ")}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: sc.bg, color: sc.color }}>
                            {sc.label}
                          </span>
                        </td>

                        {/* Vehicle */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>
                          {r.vehicle || "—"}
                        </td>

                        {/* Chassis */}
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>
                          {r.chassis || "—"}
                        </td>

                        {/* Journey */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="max-w-[120px] truncate" style={{ color: "var(--text-muted)" }} title={r.fromLocation ?? ""}>
                              {r.fromLocation || "—"}
                            </span>
                            <svg className="w-3 h-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            <span className="max-w-[120px] truncate font-medium" style={{ color: "var(--text)" }} title={r.toLocation ?? ""}>
                              {r.toLocation || "—"}
                            </span>
                          </div>
                        </td>

                        {/* Departure */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {fmtDateTime(r.departureDate, r.departureTime)}
                        </td>

                        {/* Arrival */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {fmtDateTime(r.arrivalDate, r.arrivalTime)}
                        </td>

                        {/* Created By */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{r.createdBy?.name || "—"}</p>
                          {r.createdBy?.email && (
                            <p className="text-[10px] mt-0.5 truncate max-w-[120px]" style={{ color: "var(--text-muted)" }}>
                              {r.createdBy.email}
                            </p>
                          )}
                        </td>

                        {/* Approved By */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>
                          {r.approvedBy?.name || "—"}
                        </td>

                        {/* Created On */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {fmtDate(r.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SAP Cross-Check Table */}
      {searched && (
        <div className="mt-6 rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {/* Header */}
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--accent)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text)" }}>SAP Location Cross-Check</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Compares latest system location with current SAP storage location per vehicle
              </p>
            </div>
            {crossCheckLoading && (
              <svg className="ml-auto w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" style={{ color: "var(--accent)" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
          </div>

          {crossCheckError && (
            <div className="px-5 py-3 text-sm" style={{ color: "#dc2626", background: "#fee2e2" }}>{crossCheckError}</div>
          )}

          {!crossCheckLoading && !crossCheckError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Vehicle", "Chassis", "System Location", "SAP Location", "Match"].map((h, i) => (
                      <th key={i}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crossCheck.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                        No vehicles to cross-check
                      </td>
                    </tr>
                  ) : crossCheck.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      {/* Vehicle */}
                      <td className="px-4 py-3 text-xs font-medium whitespace-nowrap" style={{ color: "var(--text)" }}>
                        {row.vehicle || "—"}
                      </td>

                      {/* Chassis */}
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>
                        {row.chassis || "—"}
                      </td>

                      {/* System Location */}
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text)" }}>
                        {row.systemLocation || "—"}
                      </td>

                      {/* SAP Location */}
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text)" }}>
                        {row.sapError
                          ? <span style={{ color: "#dc2626" }}>SAP unavailable</span>
                          : row.notInSap
                            ? <span style={{ color: "#f97316" }}>Not found in SAP</span>
                            : row.sapLocation || "—"}
                      </td>

                      {/* Match */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.sapError || row.notInSap ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "#f3f4f6", color: "#6b7280" }}>
                            Unknown
                          </span>
                        ) : row.match === true ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "#dcfce7", color: "#15803d" }}>
                            ✅ Match
                          </span>
                        ) : row.match === false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "#fee2e2", color: "#dc2626" }}>
                            ❌ Mismatch
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ background: "#fef9c3", color: "#854d0e" }}>
                            — No codes
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
