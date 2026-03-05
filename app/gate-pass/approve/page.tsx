"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type GatePass = {
  id: string; gatePassNumber: string; passType: string; status: string;
  vehicle: string; chassis: string | null; departureDate: string | null;
  requestedBy: string | null; toLocation: string | null;
  createdBy: { name: string }; createdAt: string;
};

const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_APPROVAL: { label: "Approval Pending", bg: "#fff7ed", color: "#c2410c" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d" },
  REJECTED:         { label: "Rejected",           bg: "#fef2f2", color: "#991b1b" },
  GATE_OUT:         { label: "Gate Out",            bg: "#eff6ff", color: "#1d4ed8" },
  COMPLETED:        { label: "Completed",           bg: "#f5f3ff", color: "#5b21b6" },
};

export default function ApproverListPage() {
  const router = useRouter();
  const [activeType, setActiveType] = useState<"LOCATION_TRANSFER" | "CUSTOMER_DELIVERY">("LOCATION_TRANSFER");
  const [search, setSearch] = useState("");
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      passType: activeType,
      status: "PENDING_APPROVAL",
      page: String(page),
      limit: "10",
      ...(search ? { search } : {}),
    });
    try {
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPasses(data.passes || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [activeType, page, search]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);
  useEffect(() => { setPage(1); }, [activeType, search]);

  const pending = passes.filter((p) => p.status === "PENDING_APPROVAL").length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>New Requests</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>Review and approve submitted gate pass requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 mb-6 max-w-xs">
        <div className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "#c2410c" }}>Pending Approvals</p>
          <p className="text-3xl font-bold" style={{ color: "var(--text)" }}>{total}</p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between p-4 border-b gap-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-2">
            {(["LOCATION_TRANSFER", "CUSTOMER_DELIVERY"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={activeType === t
                  ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff" }
                  : { background: "var(--surface2)", color: "var(--text-muted)" }
                }
              >
                {t === "LOCATION_TRANSFER" ? "Location Transfer" : "Customer Delivery"}
              </button>
            ))}
          </div>
          <div className="relative w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search passes..."
              className="w-full border rounded-xl px-4 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                {["Action", "Gate Pass No", "Vehicle / Chassis", activeType === "LOCATION_TRANSFER" ? "To Location" : "Vehicle Details", "Requested By", "Departure Date", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse" style={{ background: "var(--border)", width: "80%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : passes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    No gate passes found
                  </td>
                </tr>
              ) : (
                passes.map((p, i) => {
                  const sc = statusCfg[p.status] || statusCfg["PENDING_APPROVAL"];
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="hover:bg-opacity-50 transition-colors"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { fetch(`/api/notifications/read`, { method: "POST" }); router.push(`/gate-pass/approve/${p.id}`); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all hover:shadow-sm"
                          style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--accent)" }}
                          title="View"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-xs" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                        {p.chassis && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>
                        {activeType === "LOCATION_TRANSFER" ? (p.toLocation || "-") : (p.vehicle || "-")}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.requestedBy || p.createdBy.name}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>{p.departureDate || "-"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Showing {passes.length} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
