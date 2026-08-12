"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type DraftPass = {
  id: string;
  gatePassNumber: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  passType: string;
  passSubType: string | null;
  status: string;
  fromLocation: string | null;
  toLocation: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
  parentPass?: { gatePassNumber: string } | null;
};

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function passTypeLabel(p: DraftPass) {
  if (p.passType === "AFTER_SALES") return "After Sales";
  if (p.passType === "LOCATION_TRANSFER") return "Location Transfer";
  if (p.passType === "CUSTOMER_DELIVERY") return "Customer Delivery";
  return p.passType;
}

export default function PendingCompletionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [passes, setPasses] = useState<DraftPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchPasses = useCallback(async () => {
    try {
      const res = await fetch("/api/gate-pass?status=DRAFT&limit=100", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPasses(data.passes ?? []);
        setLastRefresh(new Date());
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void fetchPasses();
  }, [status, fetchPasses]);

  useEffect(() => {
    const id = setInterval(() => void fetchPasses(), 60_000);
    return () => clearInterval(id);
  }, [fetchPasses]);

  if (status === "loading" || loading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
        ))}
      </div>
    );
  }

  if (session?.user?.role !== "SECURITY_OFFICER" && session?.user?.role !== "ADMIN") {
    return (
      <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
        Access restricted to Security Officers.
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = passes.filter((p) => {
    if (!q) return true;
    return (
      p.gatePassNumber.toLowerCase().includes(q) ||
      p.vehicle.toLowerCase().includes(q) ||
      (p.chassis ?? "").toLowerCase().includes(q) ||
      (p.make ?? "").toLowerCase().includes(q) ||
      passTypeLabel(p).toLowerCase().includes(q) ||
      p.createdBy.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "#fffbeb", border: "1.5px solid #fbbf24" }}>
          <svg className="w-6 h-6" style={{ color: "#b45309" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black" style={{ color: "var(--text)" }}>Pending Completion</h1>
            {passes.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-sm font-bold" style={{ background: "#fef3c7", color: "#92400e" }}>
                {passes.length}
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Passes created by Security — awaiting initiator completion
          </p>
        </div>
        <button
          onClick={() => void fetchPasses()}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-70 flex-shrink-0"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          title="Refresh"
        >
          <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Notice banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5"
        style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
        <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#d97706" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <p className="text-sm font-medium" style={{ color: "#92400e" }}>
          Initiator / Service Advisor has been notified for each pass below.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by GP number, vehicle, chassis, or initiator…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      </div>

      {/* Pass list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl"
          style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: "#fffbeb" }}>
            ✅
          </div>
          <div className="text-center">
            <p className="text-base font-bold" style={{ color: "var(--text)" }}>
              {q ? "No matches found" : "All clear!"}
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {q ? `No passes match "${search}"` : "No passes are awaiting initiator completion."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "#f59e0b80" }}>
          <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {filtered.map((p) => {
              const typeLabel = passTypeLabel(p);
              const gpNum = (p.passType === "AFTER_SALES" ? p.parentPass?.gatePassNumber : null) ?? p.gatePassNumber;
              return (
                <button
                  key={p.id}
                  onClick={() => router.push(`/gate-pass/${p.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left transition-all hover:opacity-80"
                  style={{ background: "transparent" }}
                >
                  {/* Left icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "#fffbeb" }}>
                    <svg className="w-5 h-5" style={{ color: "#b45309" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-black font-mono" style={{ color: "var(--accent)" }}>{gpNum}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>{typeLabel}</span>
                      {p.passSubType && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                          {p.passSubType.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold font-mono truncate" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                    {p.chassis && (
                      <p className="text-xs font-mono mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {p.fromLocation && (
                        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                          From: {p.fromLocation}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                        by {p.createdBy.name} · {timeAgo(p.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Status + chevron */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-xs px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap"
                      style={{ background: "#fef3c7", color: "#92400e" }}>
                      Pending Completion
                    </span>
                    <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-xs mt-5" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
        Auto-refreshes every 60 seconds · Last updated {lastRefresh.toLocaleTimeString()}
      </p>
    </div>
  );
}
