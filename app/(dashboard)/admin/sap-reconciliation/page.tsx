"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type ReconRow = {
  id: string;
  gatePassId: string;
  gatePassNumber: string;
  vehicle: string;
  initiatorName: string;
  fromLocation: string;
  toLocation: string;
  ltCompletedAt: string;
  mmstaAtCompletion: string;
  sdstaAtCompletion: string;
  latestMmsta: string | null;
  latestSdsta: string | null;
  eligibility: "PENDING" | "READY" | "WRITTEN" | "FAILED";
  eligibilityLabel: string;
  lastCheckedAt: string | null;
  writtenAt: string | null;
  writtenByName: string | null;
};

type BulkResult = { reconciliationId: string; success: boolean; alreadyWritten?: boolean; message: string };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const eligibilityColors: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "#f1f5f9", fg: "#475569" },
  READY:   { bg: "#dcfce7", fg: "#166534" },
  WRITTEN: { bg: "#e0e7ff", fg: "#3730a3" },
  FAILED:  { bg: "#fee2e2", fg: "#dc2626" },
};

export default function SapReconciliationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [rows, setRows] = useState<ReconRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [eligibilityFilter, setEligibilityFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkingNow, setCheckingNow] = useState(false);
  const [writing, setWriting] = useState<Set<string>>(new Set());
  const [bulkWriting, setBulkWriting] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status === "authenticated" && (session as any)?.user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [status, session, router]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (eligibilityFilter !== "ALL") params.set("eligibility", eligibilityFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params;
  }, [eligibilityFilter, fromDate, toDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sap-reconciliation?${buildParams()}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(); }, [load]);

  async function handleCheckNow() {
    setCheckingNow(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/sap-reconciliation/check", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setBanner({ kind: "error", text: json.error ?? "Check failed" }); return; }
      setBanner({ kind: "success", text: `Checked ${json.checked} pending vehicle(s) — ${json.newlyReady} newly ready for SAP write.` });
      await load();
    } finally {
      setCheckingNow(false);
    }
  }

  async function handleWrite(row: ReconRow) {
    setWriting(prev => new Set(prev).add(row.id));
    setBanner(null);
    try {
      const res = await fetch("/api/admin/sap-reconciliation/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconciliationId: row.id }),
      });
      const json = await res.json();
      setBanner({
        kind: json.success ? "success" : "error",
        text: `${row.vehicle} (${row.gatePassNumber}): ${json.message}`,
      });
      await load();
    } finally {
      setWriting(prev => { const n = new Set(prev); n.delete(row.id); return n; });
    }
  }

  async function handleBulkWrite() {
    if (selected.size === 0) return;
    setBulkWriting(true);
    setBanner(null);
    setBulkResults(null);
    try {
      const res = await fetch("/api/admin/sap-reconciliation/bulk-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconciliationIds: [...selected] }),
      });
      const json = await res.json();
      setBulkResults(json.results ?? []);
      await load();
    } finally {
      setBulkWriting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleSelectAllReady() {
    const readyIds = rows.filter(r => r.eligibility === "READY").map(r => r.id);
    setSelected(prev => (prev.size === readyIds.length ? new Set() : new Set(readyIds)));
  }

  function downloadUrl(format: "csv" | "xlsx") {
    const params = buildParams();
    params.set("format", format);
    return `/api/admin/sap-reconciliation/export?${params}`;
  }

  const readyCount = rows.filter(r => r.eligibility === "READY").length;

  if (status === "loading") return null;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg)" }}>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>SAP Reconciliation</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Location Transfer vehicles that completed without an SAP write — re-check SAP status and write manually once eligible.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={downloadUrl("csv")} className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}>Download CSV</a>
          <a href={downloadUrl("xlsx")} className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}>Download Excel</a>
          <button onClick={handleCheckNow} disabled={checkingNow}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}>
            {checkingNow ? "Checking…" : "Check Now"}
          </button>
        </div>
      </div>

      {banner && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
          style={{ background: banner.kind === "success" ? "#dcfce7" : "#fee2e2", color: banner.kind === "success" ? "#166534" : "#dc2626" }}>
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="ml-4 text-lg leading-none">×</button>
        </div>
      )}

      {bulkResults && (
        <div className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Bulk write results — {bulkResults.filter(r => r.success).length} succeeded, {bulkResults.filter(r => !r.success).length} failed
            </h3>
            <button onClick={() => setBulkResults(null)} className="text-lg leading-none" style={{ color: "var(--text-muted)" }}>×</button>
          </div>
          <ul className="space-y-1 text-sm">
            {bulkResults.map(r => {
              const row = rows.find(x => x.id === r.reconciliationId);
              return (
                <li key={r.reconciliationId} style={{ color: r.success ? "#166534" : "#dc2626" }}>
                  {row ? `${row.vehicle} (${row.gatePassNumber})` : r.reconciliationId} — {r.message}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border overflow-hidden mb-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 px-5 py-4 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
          <select value={eligibilityFilter} onChange={e => setEligibilityFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="ALL">All Statuses</option>
            <option value="READY">Ready for SAP Write</option>
            <option value="PENDING">Not Yet Eligible</option>
            <option value="WRITTEN">Already Written</option>
            <option value="FAILED">Write Failed</option>
          </select>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
          <button onClick={load}
            className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}>Apply</button>

          {selected.size > 0 && (
            <button onClick={handleBulkWrite} disabled={bulkWriting}
              className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: "#059669", color: "#fff" }}>
              {bulkWriting ? "Writing…" : `Write Selected to SAP (${selected.size})`}
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox" checked={readyCount > 0 && selected.size === readyCount} onChange={toggleSelectAllReady} disabled={readyCount === 0} />
                  </th>
                  {["Vehicle", "Gate Pass No.", "Initiator", "From", "To", "LT Completed", "Status at Completion", "Latest MMSTA/SDSTA", "Eligibility", "SAP Write Date", "Last Checked", "Action"].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No pending SAP reconciliation records</td></tr>
                ) : rows.map(r => {
                  const colors = eligibilityColors[r.eligibility] ?? eligibilityColors.PENDING;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3">
                        {r.eligibility === "READY" && (
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text)" }}>{r.vehicle}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text)" }}>{r.gatePassNumber}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.initiatorName}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.fromLocation}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.toLocation}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.ltCompletedAt)}</td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>{r.mmstaAtCompletion || "—"} / {r.sdstaAtCompletion || "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>{r.latestMmsta ?? "—"} / {r.latestSdsta ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ background: colors.bg, color: colors.fg }}>
                          {r.eligibility === "WRITTEN" && r.latestMmsta ? `${r.eligibilityLabel} (${r.latestMmsta})` : r.eligibilityLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {r.writtenAt ? fmtDate(r.writtenAt) : "—"}
                        {r.writtenAt && r.writtenByName ? <div style={{ color: "var(--text-muted)" }}>by {r.writtenByName}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.lastCheckedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {r.eligibility === "WRITTEN" ? (
                          <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Already Written</span>
                        ) : r.eligibility === "READY" ? (
                          <button onClick={() => handleWrite(r)} disabled={writing.has(r.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                            style={{ background: "#059669", color: "#fff" }}>
                            {writing.has(r.id) ? "Writing…" : "Write to SAP"}
                          </button>
                        ) : r.eligibility === "FAILED" ? (
                          <button onClick={() => handleWrite(r)} disabled={writing.has(r.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                            style={{ background: "#dc2626", color: "#fff" }}>
                            {writing.has(r.id) ? "Retrying…" : "Retry Write"}
                          </button>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
