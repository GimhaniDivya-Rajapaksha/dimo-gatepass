"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type ParentPass = { id: string; gatePassNumber: string; passSubType: string | null; status: string; vehicle: string };
type GatePass = {
  id: string; gatePassNumber: string; passType: string; passSubType: string | null;
  status: string; vehicle: string; chassis: string | null;
  departureDate: string | null; requestedBy: string | null;
  toLocation: string | null; fromLocation: string | null;
  paymentType: string | null;
  hasCredit: boolean | null; creditApproved: boolean | null;
  hasImmediate: boolean | null; cashierCleared: boolean | null;
  createdBy: { name: string }; createdAt: string;
  parentPass: ParentPass | null;
};

const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  PENDING_APPROVAL: { label: "Approval Pending", bg: "#fff7ed", color: "#c2410c" },
  APPROVED:         { label: "Approved",          bg: "#f0fdf4", color: "#15803d" },
  REJECTED:         { label: "Rejected",           bg: "#fef2f2", color: "#991b1b" },
  GATE_OUT:         { label: "Gate Out",            bg: "#eff6ff", color: "#1d4ed8" },
  COMPLETED:        { label: "Completed",           bg: "#f5f3ff", color: "#5b21b6" },
  CASHIER_REVIEW:   { label: "Cashier Review",      bg: "#fef3c7", color: "#b45309" },
};

const subTypeCfg: Record<string, { label: string; short: string; bg: string; color: string; dot: string; step: number; stepLabel: string }> = {
  MAIN_IN:  { label: "Main Gate IN",  short: "MAIN IN",  bg: "#f0fdf4", color: "#15803d", dot: "#22c55e", step: 1, stepLabel: "Vehicle arrival at service center" },
  SUB_OUT:  { label: "Sub Gate OUT",  short: "SUB OUT",  bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6", step: 2, stepLabel: "Vehicle moving to another plant" },
  SUB_IN:   { label: "Sub Gate IN",   short: "SUB IN",   bg: "#fffbeb", color: "#92400e", dot: "#f59e0b", step: 3, stepLabel: "Vehicle returning from sub-plant" },
  MAIN_OUT: { label: "Main Gate OUT", short: "MAIN OUT", bg: "#fdf4ff", color: "#6b21a8", dot: "#a855f7", step: 4, stepLabel: "Final departure from service center" },
};

export default function ApproverListPage() {
  const router = useRouter();
  const [activeType, setActiveType] = useState<"LOCATION_TRANSFER" | "CUSTOMER_DELIVERY" | "AFTER_SALES">("LOCATION_TRANSFER");
  const [search, setSearch] = useState("");
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({
    LOCATION_TRANSFER: 0, CUSTOMER_DELIVERY: 0, AFTER_SALES: 0,
  });

  const fetchCounts = useCallback(async () => {
    const types = ["LOCATION_TRANSFER", "CUSTOMER_DELIVERY", "AFTER_SALES"] as const;
    const results = await Promise.all(
      types.map((t) =>
        fetch(`/api/gate-pass?passType=${t}&status=PENDING_APPROVAL&limit=1`)
          .then((r) => r.json())
          .then((d) => ({ type: t, count: d.total ?? 0 }))
          .catch(() => ({ type: t, count: 0 }))
      )
    );
    const counts: Record<string, number> = {};
    results.forEach(({ type, count }) => { counts[type] = count; });
    setTabCounts(counts);
  }, []);

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

  useEffect(() => { fetchPasses(); void fetchCounts(); }, [fetchPasses, fetchCounts]);
  useEffect(() => { setPage(1); }, [activeType, search]);


  const handleView = (id: string) => {
    fetch(`/api/notifications/read`, { method: "POST" });
    router.push(`/gate-pass/${id}`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Pending Requests</h1>
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
            {(["LOCATION_TRANSFER", "CUSTOMER_DELIVERY", "AFTER_SALES"] as const).map((t) => {
              const label = t === "LOCATION_TRANSFER" ? "Location Transfer" : t === "CUSTOMER_DELIVERY" ? "Customer Delivery" : "Service / Repair";
              const cnt = tabCounts[t] ?? 0;
              return (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={activeType === t
                    ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff" }
                    : { background: "var(--surface2)", color: "var(--text-muted)" }
                  }
                  suppressHydrationWarning
                >
                  {label}
                  {cnt > 0 && (
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                      style={activeType === t
                        ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                        : { background: "#ef4444", color: "#fff" }
                      }
                    >
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="relative w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search passes..."
              className="w-full border rounded-xl px-4 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              suppressHydrationWarning
            />
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {activeType === "AFTER_SALES" ? (
          /* ── After Sales: card-based view with journey context ── */
          <div className="p-4">
            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border p-5 animate-pulse" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                    <div className="flex gap-3">
                      <div className="w-16 h-16 rounded-xl" style={{ background: "var(--border)" }} />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-4 rounded w-32" style={{ background: "var(--border)" }} />
                        <div className="h-3 rounded w-48" style={{ background: "var(--border)" }} />
                        <div className="h-3 rounded w-40" style={{ background: "var(--border)" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : passes.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--surface2)" }}>
                  <svg className="w-7 h-7" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No Service / Repair passes pending</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {passes.map((p, i) => {
                  const sc = statusCfg[p.status] || statusCfg["PENDING_APPROVAL"];
                  const stc = p.passSubType ? subTypeCfg[p.passSubType] : null;
                  const isSubPass = !!p.parentPass;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-2xl border p-5 transition-all hover:shadow-md cursor-pointer"
                      style={{ background: "var(--surface)", borderColor: stc ? stc.dot + "55" : "var(--border)" }}
                      onClick={() => handleView(p.id)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Pass type icon box */}
                        <div className="flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-0.5"
                          style={{ background: stc ? stc.bg : "var(--surface2)", border: `2px solid ${stc ? stc.dot + "66" : "var(--border)"}` }}>
                          <svg className="w-5 h-5" style={{ color: stc ? stc.dot : "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {p.passSubType === "MAIN_IN" && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />}
                            {p.passSubType === "SUB_OUT" && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />}
                            {p.passSubType === "SUB_IN"  && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" />}
                            {p.passSubType === "MAIN_OUT"&& <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />}
                            {!p.passSubType && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
                          </svg>
                          <span className="text-[9px] font-bold leading-none text-center" style={{ color: stc ? stc.color : "var(--text-muted)" }}>
                            {stc ? stc.short : "SR"}
                          </span>
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            {stc && (
                              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: stc.bg, color: stc.color }}>
                                {stc.label}
                              </span>
                            )}
                            {p.status === "CASHIER_REVIEW" && p.hasCredit && !p.creditApproved ? (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                                Credit Pending
                              </span>
                            ) : (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
                                {sc.label}
                              </span>
                            )}
                          </div>

                          {/* Vehicle */}
                          <p className="font-bold text-base leading-tight" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                          {p.chassis && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Chassis: {p.chassis}</p>}

                          {/* Journey step description */}
                          {stc && (
                            <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--text-muted)" }}>
                              {stc.stepLabel}
                            </p>
                          )}

                          {/* Location flow */}
                          {(p.fromLocation || p.toLocation) && (
                            <div className="flex items-center gap-2 mt-2">
                              {p.fromLocation && (
                                <span className="text-xs px-2 py-0.5 rounded-lg font-medium" style={{ background: "var(--surface2)", color: "var(--text)" }}>
                                  {p.fromLocation}
                                </span>
                              )}
                              {p.fromLocation && p.toLocation && (
                                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                              )}
                              {p.toLocation && (
                                <span className="text-xs px-2 py-0.5 rounded-lg font-medium" style={{ background: "var(--surface2)", color: "var(--text)" }}>
                                  {p.toLocation}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Parent pass reference for sub-passes */}
                          {isSubPass && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <svg className="w-3 h-3 flex-shrink-0" style={{ color: "#6b7280" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              <span className="text-xs" style={{ color: "#6b7280" }}>
                                Part of journey{" "}
                                <span className="font-mono font-semibold" style={{ color: "var(--accent)" }}>
                                  {p.parentPass?.gatePassNumber}
                                </span>
                              </span>
                            </div>
                          )}

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-3 mt-2.5">
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              By <span className="font-medium" style={{ color: "var(--text)" }}>{p.createdBy.name}</span>
                            </span>
                            {p.departureDate && (
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                Departure: <span className="font-medium" style={{ color: "var(--text)" }}>{p.departureDate}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right side: GP number + action */}
                        <div className="flex flex-col items-end gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Gate Pass</p>
                            <p className="font-mono font-bold text-sm" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleView(p.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:shadow-sm"
                            style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff" }}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Review
                          </button>
                        </div>
                      </div>

                      {/* Journey step indicator strip */}
                      {stc && (
                        <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                          <div className="flex items-center gap-0">
                            {["MAIN_IN", "SUB_OUT", "SUB_IN", "MAIN_OUT"].map((st, idx) => {
                              const cfg = subTypeCfg[st];
                              const isCurrent = p.passSubType === st;
                              const isPast = (subTypeCfg[p.passSubType ?? ""]?.step ?? 0) > cfg.step;
                              return (
                                <div key={st} className="flex items-center gap-0 flex-1">
                                  <div className="flex flex-col items-center gap-1 flex-1">
                                    <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                      style={{
                                        borderColor: isCurrent ? cfg.dot : isPast ? cfg.dot + "88" : "var(--border)",
                                        background: isCurrent ? cfg.dot : isPast ? cfg.dot + "22" : "var(--surface2)",
                                      }}>
                                      {isCurrent ? (
                                        <div className="w-2 h-2 rounded-full bg-white" />
                                      ) : isPast ? (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: cfg.dot }}>
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : (
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--border)" }} />
                                      )}
                                    </div>
                                    <span className="text-[9px] font-semibold leading-none" style={{ color: isCurrent ? cfg.color : "var(--text-muted)" }}>
                                      {cfg.short}
                                    </span>
                                  </div>
                                  {idx < 3 && (
                                    <div className="h-0.5 flex-1 mb-4" style={{ background: isPast ? cfg.dot + "55" : "var(--border)" }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── Location Transfer + Customer Delivery: table view ── */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  {["Action", "Gate Pass No", "Vehicle / Chassis", activeType === "LOCATION_TRANSFER" ? "To Location" : "Payment Type", "Requested By", "Departure Date", "Status"].map((h) => (
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
                            onClick={() => handleView(p.id)}
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
                          {activeType === "LOCATION_TRANSFER" ? (p.toLocation || "-") : (p.paymentType || "-")}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--text)" }}>{p.createdBy.name}</td>
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
        )}

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
