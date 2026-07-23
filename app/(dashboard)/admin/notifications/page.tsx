"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────
type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string | null; defaultLocation: string | null } | null;
  gatePass: { id: string; gatePassNumber: string; passType: string; status: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const typeCfg: Record<string, { icon: string; bg: string; color: string; label: string }> = {
  GATE_PASS_SUBMITTED:      { icon: "📋", bg: "#eff6ff", color: "#1d4ed8", label: "New Request" },
  GATE_PASS_APPROVED:       { icon: "✅", bg: "#f0fdf4", color: "#15803d", label: "Approved" },
  GATE_PASS_REJECTED:       { icon: "❌", bg: "#fef2f2", color: "#dc2626", label: "Rejected" },
  GATE_PASS_RECEIVED:       { icon: "🚗", bg: "#f5f3ff", color: "#5b21b6", label: "Gate Out" },
  GATE_PASS_RESUBMITTED:    { icon: "🔄", bg: "#fff7ed", color: "#c2410c", label: "Resubmitted" },
  CASHIER_REVIEW_REQUIRED:  { icon: "💰", bg: "#fffbeb", color: "#b45309", label: "Payment Review" },
  DRIVER_CHANGED:           { icon: "🚚", bg: "#eff6ff", color: "#1d4ed8", label: "Driver Changed" },
  NEW_USER_REGISTERED:      { icon: "👤", bg: "#faf5ff", color: "#7c3aed", label: "New User" },
};
function cfgFor(type: string) {
  return typeCfg[type] ?? { icon: "🔔", bg: "#f3f4f6", color: "#6b7280", label: type.replace(/_/g, " ") };
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function AdminNotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const limit = 50;

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status === "authenticated" && (session as any)?.user?.role !== "ADMIN") router.replace("/");
  }, [status, session, router]);

  const load = useCallback(async (p: number, query: string, type: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (query.trim()) params.set("q", query.trim());
      if (type) params.set("type", type);
      const res = await fetch(`/api/admin/notifications?${params}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load notifications"); return; }
      setRows(json.notifications ?? []);
      setTotal(json.total ?? 0);
      setTypes(json.types ?? []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if ((session as any)?.user?.role === "ADMIN") load(page, q, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, page, typeFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1, q, typeFilter);
  }

  if (status === "loading") return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg)" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>All Notifications</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Every notification ever created, for every user, across every plant — read-only, system-wide view.
        </p>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <input
            type="text" placeholder="Search by title, message, recipient, or GP number…"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="flex-1 min-w-[220px] px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{cfgFor(t).label}</option>
            ))}
          </select>
          <button type="submit"
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}>
            Search
          </button>
          <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>{total} total</span>
        </form>

        {error && (
          <div className="mx-5 mt-4 px-3 py-2 rounded-lg text-sm" style={{ background: "#fee2e2", color: "#dc2626" }}>{error}</div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                  {["Type", "Title / Message", "Recipient", "Plant", "Gate Pass", "Read", "Created"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No notifications found</td></tr>
                ) : rows.map((n) => {
                  const cfg = cfgFor(n.type);
                  return (
                    <tr key={n.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          <span>{cfg.icon}</span>{cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-md">
                        <p className="font-medium" style={{ color: "var(--text)" }}>{n.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{n.message}</p>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {n.user ? (
                          <>
                            <p style={{ color: "var(--text)" }}>{n.user.name}</p>
                            <p>{n.user.role ?? "—"}</p>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{n.user?.defaultLocation ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {n.gatePass ? (
                          <Link href={`/gate-pass/${n.gatePass.id}`} className="font-mono hover:underline" style={{ color: "var(--accent)" }}>
                            {n.gatePass.gatePassNumber}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: n.read ? "#f3f4f6" : "#fef9c3", color: n.read ? "#6b7280" : "#854d0e" }}>
                          {n.read ? "Read" : "Unread"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtDateTime(n.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              Previous
            </button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
