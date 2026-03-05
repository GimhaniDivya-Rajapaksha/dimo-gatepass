"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

type GatePass = {
  id: string; gatePassNumber: string; passType: string; status: string;
  vehicle: string; chassis: string | null; departureDate: string | null;
  requestedBy: string | null; toLocation: string | null; vehicleDetails: string | null;
  createdBy: { name: string }; createdAt: string;
};

const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", bg: "#fff7ed", color: "#c2410c" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d" },
  REJECTED:         { label: "Rejected",          bg: "#fef2f2", color: "#991b1b" },
  GATE_OUT:         { label: "Gate Out",           bg: "#eff6ff", color: "#1d4ed8" },
  COMPLETED:        { label: "Completed",          bg: "#f5f3ff", color: "#5b21b6" },
  CANCELLED:        { label: "Cancelled",          bg: "#f9fafb", color: "#6b7280" },
};

export default function GatePassListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "ALL");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "15" });
    if (search) params.set("search", search);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const d = await res.json();
        setPasses(d.passes || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this gate pass request?")) return;
    setCancellingId(id);
    try {
      await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      fetchPasses();
    } finally {
      setCancellingId(null);
    }
  }

  // Sync statusFilter when URL changes (sidebar navigation)
  useEffect(() => {
    setStatusFilter(searchParams.get("status") ?? "ALL");
    setPage(1);
  }, [searchParams]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>My Gate Passes</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{total} records found</p>
        </div>
        <Link
          href="/gate-pass/create"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md"
          style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Create Gate Pass
        </Link>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 p-4 border-b flex-wrap" style={{ borderColor: "var(--border)" }}>
          <div className="relative flex-1 min-w-52">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by chassis, GP number..."
              className="w-full border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="ALL">All Status</option>
            {Object.entries(statusCfg).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                {["Action", "Gate Pass No", "Vehicle / Chassis", "Departure From", "Requested By", "Departure Date", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: "var(--border)", width: "80%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : passes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center" style={{ color: "var(--text-muted)" }}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "var(--surface2)" }}>📋</div>
                      <p className="text-sm">No gate passes found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                passes.map((p, i) => {
                  const sc = statusCfg[p.status] || statusCfg["PENDING_APPROVAL"];
                  const canPrint  = ["APPROVED", "GATE_OUT", "COMPLETED"].includes(p.status);
                  const canCancel = p.status === "PENDING_APPROVAL";
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => router.push(`/gate-pass/${p.id}`)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center border"
                            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--accent)" }}
                            title="View"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => canPrint && router.push(`/gate-pass/${p.id}?print=1`)}
                            disabled={!canPrint}
                            className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                            style={{ background: canPrint ? "var(--surface)" : "var(--surface2)", borderColor: canPrint ? "#10b981" : "var(--border)", color: canPrint ? "#10b981" : "var(--text-muted)", opacity: canPrint ? 1 : 0.4, cursor: canPrint ? "pointer" : "not-allowed" }}
                            title={canPrint ? "Print" : "Available after approval"}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                          {canCancel && (
                            <button
                              onClick={() => handleCancel(p.id)}
                              disabled={cancellingId === p.id}
                              className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                              style={{ background: "var(--surface)", borderColor: "#ef4444", color: "#ef4444", opacity: cancellingId === p.id ? 0.5 : 1 }}
                              title="Cancel request"
                            >
                              {cancellingId === p.id ? (
                                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-xs" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                        {p.chassis && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.toLocation || p.vehicleDetails || "-"}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.requestedBy || p.createdBy.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{p.departureDate || "-"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.color }} />
                          {sc.label}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Showing {passes.length} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>Prev</button>
              <span className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{page}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
