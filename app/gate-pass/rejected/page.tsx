"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type GatePass = {
  id: string; gatePassNumber: string; passType: string; status: string;
  vehicle: string; chassis: string | null; departureDate: string | null;
  toLocation: string | null; rejectionReason: string | null;
  resubmitCount: number; createdAt: string;
  createdBy: { name: string }; approvedBy: { name: string } | null;
};

const passTypeLabel: Record<string, string> = {
  LOCATION_TRANSFER: "Location Transfer",
  CUSTOMER_DELIVERY: "Customer Delivery",
  AFTER_SALES: "Service / Repair",
};

export default function RejectedPassesPage() {
  const router = useRouter();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: "REJECTED", limit: "50" });
    if (search) params.set("search", search);
    try {
      const res = await fetch(`/api/gate-pass?${params}`);
      if (res.ok) {
        const d = await res.json();
        setPasses(d.passes || []);
        setTotal(d.total || 0);
      }
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Rejected Passes</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{total} rejected — click to edit and resubmit</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vehicle, GP number..."
          className="w-full border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border p-5 animate-pulse" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 rounded w-32" style={{ background: "var(--border)" }} />
                  <div className="h-3 rounded w-56" style={{ background: "var(--border)" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : passes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#fef2f2" }}>
            <svg className="w-7 h-7" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No rejected passes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {passes.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => router.push(`/gate-pass/create?rejectedId=${p.id}`)}
              className="rounded-2xl border p-5 cursor-pointer transition-all hover:shadow-md"
              style={{ background: "var(--surface)", borderColor: "#fca5a5" }}>
              <div className="flex items-start gap-4">
                {/* Red X icon */}
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#fef2f2" }}>
                  <svg className="w-5 h-5" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold" style={{ color: "var(--text)" }}>{p.vehicle}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#fef2f2", color: "#991b1b" }}>Rejected</span>
                    {p.resubmitCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#fffbeb", color: "#92400e" }}>
                        Resubmitted {p.resubmitCount}×
                      </span>
                    )}
                  </div>
                  {p.chassis && <p className="text-xs font-mono mb-1" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                  {p.rejectionReason && (
                    <div className="flex items-start gap-1.5 mt-1.5 px-3 py-2 rounded-xl" style={{ background: "#fef2f2" }}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs" style={{ color: "#991b1b" }}>
                        <span className="font-semibold">Reason: </span>{p.rejectionReason}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {passTypeLabel[p.passType] || p.passType}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/gate-pass/create?rejectedId=${p.id}`); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)" }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit & Resubmit
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
