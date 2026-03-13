"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────────────

type VehicleMaster = {
  id: string;
  vehicleNo: string;
  chassisNo: string | null;
  description: string | null;
  make: string | null;
  model: string | null;
  colourFamily: string | null;
  colour: string | null;
};

type SubPassSummary = {
  id: string;
  gatePassNumber: string;
  passSubType: string | null;
  status: string;
  toLocation: string | null;
  fromLocation: string | null;
  departureDate: string | null;
  departureTime: string | null;
  createdAt: string;
  createdBy: { name: string } | null;
};

type GatePassFull = {
  id: string;
  gatePassNumber: string;
  passType: string;
  passSubType: string | null;
  status: string;
  vehicle: string;
  vehicleColor: string | null;
  shipmentId: string | null;
  chassis: string | null;
  make: string | null;
  toLocation: string | null;
  fromLocation: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  vehicleDetails: string | null;
  departureDate: string | null;
  departureTime: string | null;
  requestedBy: string | null;
  outReason: string | null;
  transportMode: string | null;
  companyName: string | null;
  carrierName: string | null;
  carrierRegNo: string | null;
  driverName: string | null;
  driverNIC: string | null;
  driverContact: string | null;
  mileage: string | null;
  insurance: string | null;
  garagePlate: string | null;
  comments: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string; email: string } | null;
  approvedBy: { name: string } | null;
  subPasses: SubPassSummary[];
  parentPass: { id: string; gatePassNumber: string; passSubType: string | null; status: string } | null;
};

type Stats = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  completed: number;
  gateOut: number;
  cancelled: number;
};

// ── Config ────────────────────────────────────────────────────────────────────

const statusCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",          bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",           bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",          bg: "#f5f3ff", color: "#5b21b6", dot: "#a855f7" },
  CANCELLED:        { label: "Cancelled",          bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
};

const passTypeCfg: Record<string, { label: string; bg: string; color: string }> = {
  LOCATION_TRANSFER: { label: "Location Transfer", bg: "#eff6ff", color: "#1d4ed8" },
  CUSTOMER_DELIVERY: { label: "Customer Delivery", bg: "#f0fdf4", color: "#15803d" },
  AFTER_SALES:       { label: "Service / Repair",  bg: "#fdf4ff", color: "#6b21a8" },
};

const subTypeCfg: Record<string, { label: string; bg: string; color: string }> = {
  MAIN_IN:  { label: "Main IN",  bg: "#f0fdf4", color: "#15803d" },
  SUB_OUT:  { label: "Sub OUT",  bg: "#eff6ff", color: "#1d4ed8" },
  SUB_IN:   { label: "Sub IN",   bg: "#fffbeb", color: "#92400e" },
  MAIN_OUT: { label: "Main OUT", bg: "#fdf4ff", color: "#6b21a8" },
};

// ── CSV ───────────────────────────────────────────────────────────────────────

function downloadCSV(passes: GatePassFull[], searchTerm: string) {
  const header = [
    "GP Number","Pass Type","Sub Type","Status","Vehicle","Chassis",
    "From Location","To Location","Departure Date","Departure Time",
    "Arrival Date","Arrival Time","Out Reason","Transport Mode",
    "Company","Carrier","Carrier Reg No","Driver Name","Driver NIC","Driver Contact",
    "Mileage","Insurance","Garage Plate","Comments","Requested By",
    "Created By","Created By Email","Approved By","Created At",
  ];
  const rows = passes.map((p) => [
    p.gatePassNumber, p.passType, p.passSubType ?? "", p.status,
    p.vehicle, p.chassis ?? "",
    p.fromLocation ?? "", p.toLocation ?? "",
    p.departureDate ?? "", p.departureTime ?? "",
    p.arrivalDate ?? "", p.arrivalTime ?? "",
    p.outReason ?? "", p.transportMode ?? "",
    p.companyName ?? "", p.carrierName ?? "", p.carrierRegNo ?? "",
    p.driverName ?? "", p.driverNIC ?? "", p.driverContact ?? "",
    p.mileage ?? "", p.insurance ?? "", p.garagePlate ?? "",
    p.comments ?? "", p.requestedBy ?? "",
    p.createdBy?.name ?? "", p.createdBy?.email ?? "",
    p.approvedBy?.name ?? "",
    new Date(p.createdAt).toLocaleDateString(),
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vehicle-report-${searchTerm}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}
function fmtDateTime(d: string | null, t: string | null) {
  if (!d) return "—";
  const date = fmtDate(d);
  return t ? `${date} ${t}` : date ?? "—";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VehicleReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicleMaster, setVehicleMaster] = useState<VehicleMaster | null>(null);
  const [passes, setPasses] = useState<GatePassFull[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);
  const [lastSearch, setLastSearch] = useState("");
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-64">
        <svg className="animate-spin w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }
  if (!session || !["INITIATOR", "APPROVER", "ADMIN"].includes(session.user?.role ?? "")) {
    router.replace("/");
    return null;
  }

  async function handleSearch() {
    const term = search.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setLastSearch(term);
    setCurrentLocation(null);
    setExpandedRows(new Set());
    try {
      const res = await fetch(`/api/vehicle-report?vehicleNo=${encodeURIComponent(term)}`);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to fetch vehicle report");
        setPasses(null);
        setVehicleMaster(null);
        setStats(null);
        return;
      }
      const data = await res.json();
      if (!data.passes || data.passes.length === 0) {
        setError("No gate passes found for this vehicle.");
        setPasses([]);
        setVehicleMaster(data.vehicleMaster ?? null);
        setStats(data.stats ?? null);
        return;
      }
      setVehicleMaster(data.vehicleMaster ?? null);
      setPasses(data.passes ?? []);
      setStats(data.stats ?? null);
      setCurrentLocation(data.currentLocation ?? null);
      setError(null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const hasPasses = passes !== null && passes.length > 0;

  return (
    <>
      <style>{`
        @media print {
          [data-sidebar], nav, aside, .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-report { padding: 0 !important; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th, td { border: 1px solid #ccc; padding: 4px 6px; color: black !important; background: white !important; }
          th { background: #f3f4f6 !important; font-weight: bold; }
          a { color: black !important; text-decoration: none; }
          .status-badge { border: 1px solid #ccc; padding: 1px 4px; border-radius: 4px; }
        }
      `}</style>

      <div className="flex flex-col print-report" style={{ height: "100%", minWidth: 0, overflow: "hidden" }}>

        {/* ── FIXED TOP ── */}
        <div className="flex-shrink-0">

          {/* Page header */}
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Vehicle Report</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                Full gate pass history, journey trail &amp; current location for any vehicle
              </p>
            </div>
            {hasPasses && (
              <div className="flex items-center gap-2 no-print">
                <button
                  onClick={() => downloadCSV(passes!, lastSearch)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="rounded-2xl border p-4 mb-3 no-print" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search by vehicle number or chassis number…"
                  className="w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading || !search.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
              >
                {loading
                  ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                }
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {/* Vehicle profile card */}
          {!loading && searched && !error && (
            <motion.div
              className="rounded-2xl border mb-3 overflow-hidden"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
            >
              {/* Top row: identity + location + stats */}
              <div className="px-5 py-4 flex flex-wrap items-center gap-5">

                {/* Vehicle icon + number */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#1a4f9e18,#2563eb22)" }}>
                    <svg className="w-5 h-5" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M13 8h4l3 3v5h-7V8z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base font-bold font-mono" style={{ color: "var(--accent)" }}>
                        {vehicleMaster?.vehicleNo ?? lastSearch.toUpperCase()}
                      </span>
                      {vehicleMaster ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                          In Master Data
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#f9fafb", color: "#6b7280" }}>
                          Not in Master
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {vehicleMaster?.chassisNo && (
                        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                          {vehicleMaster.chassisNo}
                        </span>
                      )}
                      {(vehicleMaster?.make || vehicleMaster?.model) && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          · {[vehicleMaster.make, vehicleMaster.model].filter(Boolean).join(" ")}
                        </span>
                      )}
                      {(vehicleMaster?.colour || vehicleMaster?.colourFamily) && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          · {vehicleMaster.colour ?? vehicleMaster.colourFamily}
                        </span>
                      )}
                      {vehicleMaster?.description && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          · {vehicleMaster.description}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-px h-10 flex-shrink-0 hidden sm:block" style={{ background: "var(--border)" }} />

                {/* Current location */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: currentLocation ? "#f0fdf4" : "var(--surface2)", border: "1px solid", borderColor: currentLocation ? "#bbf7d0" : "var(--border)" }}>
                    <svg className="w-4 h-4" style={{ color: currentLocation ? "#15803d" : "#9ca3af" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5" style={{ color: "var(--text-muted)" }}>
                      Current Location
                    </p>
                    <p className="text-sm font-bold leading-none" style={{ color: currentLocation ? "#15803d" : "var(--text-muted)" }}>
                      {currentLocation ?? "Unknown"}
                    </p>
                  </div>
                </div>

                <div className="flex-1" />

                {/* Stats pills */}
                {stats && (
                  <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                    <StatPill label="Total" value={stats.total} color="#2563eb" bg="#eff6ff" />
                    <StatPill label="Completed" value={stats.completed + stats.approved + stats.gateOut} color="#15803d" bg="#f0fdf4" />
                    <StatPill label="Pending" value={stats.pending} color="#c2410c" bg="#fff7ed" />
                    <StatPill label="Rejected" value={stats.rejected} color="#991b1b" bg="#fef2f2" />
                    {stats.cancelled > 0 && (
                      <StatPill label="Cancelled" value={stats.cancelled} color="#6b7280" bg="#f9fafb" />
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }}>

          {/* Empty state */}
          {!searched && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <svg className="w-10 h-10" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13 8h4l3 3v5h-7V8z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold" style={{ color: "var(--text)" }}>Search for a vehicle</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Enter a vehicle number or chassis number above</p>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <svg className="animate-spin w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          )}

          {/* Error */}
          {!loading && searched && error && (
            <div className="rounded-2xl border p-5" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium" style={{ color: "#991b1b" }}>{error}</p>
              </div>
            </div>
          )}

          {/* Journey table */}
          {!loading && searched && !error && hasPasses && (
            <motion.div
              className="rounded-2xl border overflow-hidden"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              <div className="px-5 py-3 border-b flex items-center justify-between"
                style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Journey History</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {passes!.length} record{passes!.length !== 1 ? "s" : ""} — click any row to expand details
                </p>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: "900px", width: "100%", borderCollapse: "collapse" }} className="text-sm">
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                      {["#", "Gate Pass", "Type", "Status", "Journey (From → To)", "Departure", "Arrival", "Created By", "Approved By", ""].map((h, i) => (
                        <th key={i}
                          className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{ color: "var(--text-muted)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {passes!.map((p, i) => {
                      const sc  = statusCfg[p.status] ?? statusCfg["PENDING_APPROVAL"];
                      const ptc = passTypeCfg[p.passType] ?? { label: p.passType, bg: "#f3f4f6", color: "#374151" };
                      const stc = p.passSubType ? (subTypeCfg[p.passSubType] ?? null) : null;
                      const isExpanded = expandedRows.has(p.id);
                      const hasSubPasses = p.passType === "AFTER_SALES" && p.subPasses.length > 0;

                      return (
                        <React.Fragment key={p.id}>
                          {/* Main row */}
                          <tr
                            className="cursor-pointer transition-colors"
                            style={{ borderBottom: isExpanded ? "none" : "1px solid var(--border)" }}
                            onClick={() => toggleRow(p.id)}
                            onMouseEnter={(e) => !isExpanded && (e.currentTarget.style.background = "var(--surface2)")}
                            onMouseLeave={(e) => !isExpanded && (e.currentTarget.style.background = "transparent")}
                          >
                            {/* # */}
                            <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)", width: "40px" }}>
                              {i + 1}
                            </td>
                            {/* Gate pass number */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Link
                                href={`/gate-pass/${p.id}`}
                                className="font-mono font-bold text-xs hover:underline"
                                style={{ color: "var(--accent)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {p.gatePassNumber}
                              </Link>
                              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {fmtDate(p.createdAt)}
                              </p>
                            </td>
                            {/* Type */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: ptc.bg, color: ptc.color }}>
                                {ptc.label}
                              </span>
                              {stc && (
                                <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: stc.bg, color: stc.color }}>
                                  {stc.label}
                                </span>
                              )}
                              {hasSubPasses && (
                                <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: "#fdf4ff", color: "#6b21a8" }}>
                                  {p.subPasses.length} sub
                                </span>
                              )}
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="status-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: sc.bg, color: sc.color }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                                {sc.label}
                              </span>
                            </td>
                            {/* Journey */}
                            <td className="px-4 py-3" style={{ minWidth: "220px" }}>
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="font-medium truncate max-w-[90px]" style={{ color: "var(--text)" }} title={p.fromLocation ?? "—"}>
                                  {p.fromLocation || "—"}
                                </span>
                                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                                <span className="font-semibold truncate max-w-[90px]" style={{ color: "var(--accent)" }} title={p.toLocation ?? "—"}>
                                  {p.toLocation || "—"}
                                </span>
                              </div>
                            </td>
                            {/* Departure */}
                            <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                              {fmtDateTime(p.departureDate, p.departureTime)}
                            </td>
                            {/* Arrival */}
                            <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                              {fmtDateTime(p.arrivalDate, p.arrivalTime)}
                            </td>
                            {/* Created by */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-xs font-medium" style={{ color: "var(--text)" }}>
                                {p.createdBy?.name || "—"}
                              </p>
                              {p.createdBy?.email && (
                                <p className="text-[10px] mt-0.5 truncate max-w-[130px]" style={{ color: "var(--text-muted)" }} title={p.createdBy.email}>
                                  {p.createdBy.email}
                                </p>
                              )}
                            </td>
                            {/* Approved by */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {p.approvedBy ? (
                                <div className="flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{p.approvedBy.name}</span>
                                </div>
                              ) : p.status === "REJECTED" ? (
                                <span className="text-xs" style={{ color: "#ef4444" }}>Rejected</span>
                              ) : p.status === "PENDING_APPROVAL" ? (
                                <span className="text-xs" style={{ color: "#f97316" }}>Pending</span>
                              ) : (
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                              )}
                            </td>
                            {/* Expand toggle */}
                            <td className="px-4 py-3 text-right" style={{ width: "48px" }}>
                              <svg
                                className={`w-4 h-4 transition-transform inline-block`}
                                style={{ color: "var(--text-muted)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </td>
                          </tr>

                          {/* Expanded detail panel */}
                          <AnimatePresence>
                            {isExpanded && (
                              <tr key={`${p.id}-detail`} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td colSpan={10} className="p-0">
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ overflow: "hidden", background: "var(--surface2)" }}
                                  >
                                    <div className="px-6 py-4">
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4">

                                        {/* Transport section */}
                                        <DetailGroup title="Transport">
                                          <DetailField label="Mode" value={p.transportMode} />
                                          <DetailField label="Company" value={p.companyName} />
                                          <DetailField label="Carrier" value={p.carrierName} />
                                          <DetailField label="Carrier Reg No" value={p.carrierRegNo} />
                                        </DetailGroup>

                                        {/* Driver section */}
                                        <DetailGroup title="Driver">
                                          <DetailField label="Name" value={p.driverName} />
                                          <DetailField label="NIC" value={p.driverNIC} mono />
                                          <DetailField label="Contact" value={p.driverContact} />
                                        </DetailGroup>

                                        {/* Pass details */}
                                        <DetailGroup title="Pass Details">
                                          <DetailField label="Out Reason" value={p.outReason} />
                                          <DetailField label="Requested By" value={p.requestedBy} />
                                          <DetailField label="Vehicle Details" value={p.vehicleDetails} />
                                          {p.shipmentId && <DetailField label="Shipment ID" value={p.shipmentId} mono />}
                                        </DetailGroup>

                                        {/* Additional */}
                                        <DetailGroup title="Additional">
                                          {p.mileage && <DetailField label="Mileage" value={p.mileage} />}
                                          {p.insurance && <DetailField label="Insurance" value={p.insurance} />}
                                          {p.garagePlate && <DetailField label="Garage Plate" value={p.garagePlate} mono />}
                                          {p.comments && <DetailField label="Comments" value={p.comments} />}
                                          {p.rejectionReason && <DetailField label="Rejection Reason" value={p.rejectionReason} highlight="red" />}
                                        </DetailGroup>

                                      </div>

                                      {/* Timestamps */}
                                      <div className="mt-3 pt-3 flex items-center gap-6 flex-wrap" style={{ borderTop: "1px solid var(--border)" }}>
                                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                          Created: <span style={{ color: "var(--text)" }}>{fmtDate(p.createdAt)}</span>
                                        </span>
                                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                          Last updated: <span style={{ color: "var(--text)" }}>{fmtDate(p.updatedAt)}</span>
                                        </span>
                                        {p.parentPass && (
                                          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                            Parent pass:{" "}
                                            <Link href={`/gate-pass/${p.parentPass.id}`}
                                              className="font-mono font-semibold hover:underline"
                                              style={{ color: "var(--accent)" }}
                                              onClick={(e) => e.stopPropagation()}>
                                              {p.parentPass.gatePassNumber}
                                            </Link>
                                          </span>
                                        )}
                                      </div>

                                      {/* Sub-passes */}
                                      {hasSubPasses && (
                                        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                                          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                                            style={{ color: "var(--text-muted)" }}>
                                            Sub-passes ({p.subPasses.length})
                                          </p>
                                          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                                            <table className="w-full text-xs" style={{ minWidth: "500px" }}>
                                              <thead>
                                                <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                                                  {["GP Number","Type","Status","From","To","Departure","Created By"].map((h) => (
                                                    <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
                                                      style={{ color: "var(--text-muted)" }}>{h}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {p.subPasses.map((sp) => {
                                                  const spSc  = statusCfg[sp.status] ?? statusCfg["PENDING_APPROVAL"];
                                                  const spStc = sp.passSubType ? (subTypeCfg[sp.passSubType] ?? null) : null;
                                                  return (
                                                    <tr key={sp.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                                      <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--accent)" }}>
                                                        {sp.gatePassNumber}
                                                      </td>
                                                      <td className="px-3 py-2">
                                                        {spStc
                                                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                                              style={{ background: spStc.bg, color: spStc.color }}>{spStc.label}</span>
                                                          : sp.passSubType ?? "—"}
                                                      </td>
                                                      <td className="px-3 py-2">
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                                                          style={{ background: spSc.bg, color: spSc.color }}>
                                                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: spSc.dot }} />
                                                          {spSc.label}
                                                        </span>
                                                      </td>
                                                      <td className="px-3 py-2" style={{ color: "var(--text)" }}>{sp.fromLocation || "—"}</td>
                                                      <td className="px-3 py-2 font-medium" style={{ color: "var(--accent)" }}>{sp.toLocation || "—"}</td>
                                                      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                                                        {sp.departureDate ? `${sp.departureDate}${sp.departureTime ? ` ${sp.departureTime}` : ""}` : "—"}
                                                      </td>
                                                      <td className="px-3 py-2" style={{ color: "var(--text)" }}>{sp.createdBy?.name || "—"}</td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* No passes found (but vehicle exists) */}
          {!loading && searched && !error && !hasPasses && passes !== null && (
            <div className="rounded-2xl border p-12 flex flex-col items-center gap-3"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <svg className="w-10 h-10" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No gate passes found for this vehicle</p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function StatPill({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: bg }}>
      <span className="text-xs font-bold" style={{ color }}>{value}</span>
      <span className="text-[10px] font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
        {title}
      </p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function DetailField({
  label, value, mono = false, highlight,
}: { label: string; value: string | null | undefined; mono?: boolean; highlight?: "red" }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className={`text-xs font-medium ${mono ? "font-mono" : ""}`}
        style={{ color: highlight === "red" ? "#ef4444" : "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}
