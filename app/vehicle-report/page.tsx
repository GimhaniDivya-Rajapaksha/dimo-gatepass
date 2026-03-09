"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";

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

// ── Status config ─────────────────────────────────────────────────────────────

const statusCfg: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  REJECTED:         { label: "Rejected",          bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
  GATE_OUT:         { label: "Gate Out",           bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  COMPLETED:        { label: "Completed",          bg: "#f5f3ff", color: "#5b21b6", dot: "#a855f7" },
  CANCELLED:        { label: "Cancelled",          bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
};

const passTypeCfg: Record<string, { label: string; bg: string; color: string }> = {
  LOCATION_TRANSFER:  { label: "Location Transfer",  bg: "#eff6ff", color: "#1d4ed8" },
  CUSTOMER_DELIVERY:  { label: "Customer Delivery",  bg: "#f0fdf4", color: "#15803d" },
  AFTER_SALES:        { label: "Service / Repair",   bg: "#fdf4ff", color: "#6b21a8" },
};

const subTypeCfg: Record<string, { label: string; bg: string; color: string }> = {
  MAIN_IN:  { label: "Main IN",  bg: "#f0fdf4", color: "#15803d" },
  SUB_OUT:  { label: "Sub OUT",  bg: "#eff6ff", color: "#1d4ed8" },
  SUB_IN:   { label: "Sub IN",   bg: "#fffbeb", color: "#92400e" },
  MAIN_OUT: { label: "Main OUT", bg: "#fdf4ff", color: "#6b21a8" },
};

// ── CSV download ──────────────────────────────────────────────────────────────

function downloadCSV(passes: GatePassFull[], searchTerm: string) {
  const header = [
    "GP Number", "Pass Type", "Sub Type", "Status", "Vehicle", "Chassis",
    "To Location", "From Location", "Departure Date", "Departure Time",
    "Arrival Date", "Arrival Time", "Out Reason", "Transport Mode",
    "Carrier Company", "Driver Name", "Driver NIC", "Mileage",
    "Insurance", "Garage Plate", "Comments", "Requested By",
    "Created By", "Approved By", "Created At",
  ];
  const rows = passes.map((p) => [
    p.gatePassNumber,
    p.passType,
    p.passSubType ?? "",
    p.status,
    p.vehicle,
    p.chassis ?? "",
    p.toLocation ?? "",
    p.fromLocation ?? "",
    p.departureDate ?? "",
    p.departureTime ?? "",
    p.arrivalDate ?? "",
    p.arrivalTime ?? "",
    p.outReason ?? "",
    p.transportMode ?? "",
    p.companyName ?? "",
    p.driverName ?? "",
    p.driverNIC ?? "",
    p.mileage ?? "",
    p.insurance ?? "",
    p.garagePlate ?? "",
    p.comments ?? "",
    p.requestedBy ?? "",
    p.createdBy?.name ?? "",
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

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, color, bg,
}: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-1" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      <div className="h-1 rounded-full mt-1" style={{ background: bg, opacity: 0.5 }} />
    </div>
  );
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

  // Auth guard
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasPasses = passes !== null && passes.length > 0;

  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          [data-sidebar], nav, aside, .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-report { padding: 0 !important; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th, td { border: 1px solid #ccc; padding: 4px 6px; color: black !important; background: white !important; }
          th { background: #f3f4f6 !important; font-weight: bold; }
          .page-break { page-break-before: always; }
          a { color: black !important; text-decoration: none; }
          .status-badge { border: 1px solid #ccc; padding: 1px 4px; border-radius: 4px; }
        }
      `}</style>

      <motion.div
        className="print-report"
        style={{ minWidth: 0, width: "100%", overflowX: "hidden" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Vehicle Report</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Search any vehicle to view complete gate pass history
          </p>
        </div>

        {/* Search Bar */}
        <div className="rounded-2xl border p-5 mb-6 no-print" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--text-muted)" }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search by vehicle no. or chassis no. (e.g. CBF-9321)"
                className="w-full border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !search.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {/* Empty state — no search yet */}
        {!searched && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
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
              <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
                Search for a vehicle to view its complete history
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Enter a vehicle number or chassis number above
              </p>
            </div>
          </div>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        )}

        {/* Error state */}
        {!loading && searched && error && (
          <div className="rounded-2xl border p-5 mb-6" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium" style={{ color: "#991b1b" }}>{error}</p>
            </div>
          </div>
        )}

        {!loading && searched && !error && (
          <>
            {/* Vehicle Master Card */}
            <motion.div
              className="rounded-2xl border p-5 mb-5"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#1a4f9e22,#2563eb22)" }}>
                  <svg className="w-6 h-6" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M13 8h4l3 3v5h-7V8z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      Vehicle Master
                    </p>
                    {vehicleMaster ? (
                      <span className="px-3 py-0.5 rounded-full text-xs font-semibold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                        Found in master data
                      </span>
                    ) : (
                      <span className="px-3 py-0.5 rounded-full text-xs font-semibold" style={{ background: "#f9fafb", color: "#6b7280" }}>
                        Not in master data
                      </span>
                    )}
                  </div>
                  {vehicleMaster ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
                      <MasterField label="Vehicle No" value={vehicleMaster.vehicleNo} mono large />
                      <MasterField label="Chassis No" value={vehicleMaster.chassisNo} mono />
                      <MasterField label="Description" value={vehicleMaster.description} />
                      <MasterField label="Make" value={vehicleMaster.make} />
                      <MasterField label="Model" value={vehicleMaster.model} />
                      <MasterField label="Colour Family" value={vehicleMaster.colourFamily} />
                      <MasterField label="Colour" value={vehicleMaster.colour} />
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      No master record found — showing gate passes only based on vehicle / chassis field match.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Stats Row */}
            {stats && (
              <motion.div
                className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <StatCard label="Total Passes" value={stats.total} color="#2563eb" bg="#bfdbfe" />
                <StatCard
                  label="Approved / Completed"
                  value={stats.approved + stats.completed + stats.gateOut}
                  color="#15803d"
                  bg="#bbf7d0"
                />
                <StatCard label="Pending" value={stats.pending} color="#c2410c" bg="#fed7aa" />
                <StatCard label="Rejected" value={stats.rejected} color="#991b1b" bg="#fecaca" />
              </motion.div>
            )}

            {/* Action buttons */}
            {hasPasses && (
              <motion.div
                className="flex items-center gap-3 mb-5 no-print"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <button
                  onClick={() => downloadCSV(passes!, lastSearch)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Report
                </button>
              </motion.div>
            )}

            {/* Gate Pass History Table */}
            {passes !== null && passes.length === 0 ? (
              <div className="rounded-2xl border p-12 flex flex-col items-center gap-3"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--surface2)" }}>
                  <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No gate passes found for this vehicle</p>
              </div>
            ) : hasPasses ? (
              <motion.div
                className="rounded-2xl border overflow-hidden"
                style={{ background: "var(--surface)", borderColor: "var(--border)", minWidth: 0 }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
              >
                <div className="px-5 py-3 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Gate Pass History</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{passes!.length} record{passes!.length !== 1 ? "s" : ""}</p>
                </div>
                <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                  <table style={{ minWidth: "1400px", width: "100%" }} className="text-sm">
                    <thead>
                      <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                        {[
                          "GP Number", "Type", "Status", "To Location", "From Location",
                          "Departure", "Arrival", "Out Reason", "Transport",
                          "Carrier/Company", "Driver", "NIC", "Mileage",
                          "Insurance", "Garage Plate", "Comments",
                          "Requested By", "Created By", "Approved By", "Created At",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {passes!.map((p, i) => {
                        const sc = statusCfg[p.status] ?? statusCfg["PENDING_APPROVAL"];
                        const ptc = passTypeCfg[p.passType] ?? { label: p.passType, bg: "#f3f4f6", color: "#374151" };
                        const stc = p.passSubType ? (subTypeCfg[p.passSubType] ?? null) : null;
                        const hasSubPasses = p.passType === "AFTER_SALES" && p.subPasses.length > 0;
                        const isExpanded = expandedRows.has(p.id);

                        return (
                          <>
                            <motion.tr
                              key={p.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.025 }}
                              className="transition-colors cursor-default"
                              style={{ borderBottom: "1px solid var(--border)" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              onClick={() => hasSubPasses && toggleRow(p.id)}
                            >
                              {/* GP Number */}
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {hasSubPasses && (
                                    <svg
                                      className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                                      style={{ color: "var(--text-muted)" }}
                                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  )}
                                  <Link
                                    href={`/gate-pass/${p.id}`}
                                    className="font-mono font-bold text-xs hover:underline"
                                    style={{ color: "var(--accent)" }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {p.gatePassNumber}
                                  </Link>
                                </div>
                              </td>
                              {/* Type */}
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={{ background: ptc.bg, color: ptc.color }}>
                                  {ptc.label}
                                </span>
                                {stc && (
                                  <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                    style={{ background: stc.bg, color: stc.color }}>
                                    {stc.label}
                                  </span>
                                )}
                              </td>
                              {/* Status */}
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="status-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={{ background: sc.bg, color: sc.color }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                                  {sc.label}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.toLocation || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.fromLocation || "—"}</td>
                              {/* Departure */}
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                                {p.departureDate ? (
                                  <span>{p.departureDate}{p.departureTime ? ` ${p.departureTime}` : ""}</span>
                                ) : "—"}
                              </td>
                              {/* Arrival */}
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                                {p.arrivalDate ? (
                                  <span>{p.arrivalDate}{p.arrivalTime ? ` ${p.arrivalTime}` : ""}</span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-3 text-xs max-w-32 truncate" style={{ color: "var(--text)" }} title={p.outReason ?? ""}>{p.outReason || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.transportMode || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.companyName || p.carrierName || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.driverName || "—"}</td>
                              <td className="px-3 py-3 text-xs font-mono whitespace-nowrap" style={{ color: "var(--text)" }}>{p.driverNIC || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.mileage || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.insurance || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.garagePlate || "—"}</td>
                              <td className="px-3 py-3 text-xs max-w-32 truncate" style={{ color: "var(--text)" }} title={p.comments ?? ""}>{p.comments || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.requestedBy || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.createdBy?.name || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text)" }}>{p.approvedBy?.name || "—"}</td>
                              <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                                {new Date(p.createdAt).toLocaleDateString()}
                              </td>
                            </motion.tr>

                            {/* Sub-passes expansion row */}
                            {hasSubPasses && isExpanded && (
                              <tr key={`${p.id}-sub`} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td colSpan={20} className="p-0">
                                  <div className="px-8 py-3" style={{ background: "var(--surface2)" }}>
                                    <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                                      style={{ color: "var(--text-muted)" }}>
                                      Sub-passes ({p.subPasses.length})
                                    </p>
                                    <table className="w-full text-xs" style={{ minWidth: "600px" }}>
                                      <thead>
                                        <tr>
                                          {["GP Number", "Type", "Status", "From", "To", "Departure", "Created By", "Date"].map((h) => (
                                            <th key={h} className="text-left pr-4 py-1.5 font-semibold uppercase tracking-wide"
                                              style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                                              {h}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {p.subPasses.map((sp) => {
                                          const spSc = statusCfg[sp.status] ?? statusCfg["PENDING_APPROVAL"];
                                          const spStc = sp.passSubType ? (subTypeCfg[sp.passSubType] ?? null) : null;
                                          return (
                                            <tr key={sp.id}>
                                              <td className="pr-4 py-1.5 font-mono font-bold" style={{ color: "var(--accent)" }}>
                                                {sp.gatePassNumber}
                                              </td>
                                              <td className="pr-4 py-1.5">
                                                {spStc ? (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                                    style={{ background: spStc.bg, color: spStc.color }}>
                                                    {spStc.label}
                                                  </span>
                                                ) : sp.passSubType ?? "—"}
                                              </td>
                                              <td className="pr-4 py-1.5">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                                  style={{ background: spSc.bg, color: spSc.color }}>
                                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: spSc.dot }} />
                                                  {spSc.label}
                                                </span>
                                              </td>
                                              <td className="pr-4 py-1.5" style={{ color: "var(--text)" }}>{sp.fromLocation || "—"}</td>
                                              <td className="pr-4 py-1.5" style={{ color: "var(--text)" }}>{sp.toLocation || "—"}</td>
                                              <td className="pr-4 py-1.5" style={{ color: "var(--text-muted)" }}>
                                                {sp.departureDate ? `${sp.departureDate}${sp.departureTime ? ` ${sp.departureTime}` : ""}` : "—"}
                                              </td>
                                              <td className="pr-4 py-1.5" style={{ color: "var(--text)" }}>{sp.createdBy?.name || "—"}</td>
                                              <td className="pr-4 py-1.5" style={{ color: "var(--text-muted)" }}>
                                                {new Date(sp.createdAt).toLocaleDateString()}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : null}
          </>
        )}
      </motion.div>
    </>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function MasterField({
  label, value, mono = false, large = false,
}: { label: string; value: string | null | undefined; mono?: boolean; large?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className={`${large ? "text-base font-bold" : "text-sm"} ${mono ? "font-mono" : "font-medium"}`}
        style={{ color: large ? "var(--accent)" : "var(--text)" }}
      >
        {value || "—"}
      </p>
    </div>
  );
}
