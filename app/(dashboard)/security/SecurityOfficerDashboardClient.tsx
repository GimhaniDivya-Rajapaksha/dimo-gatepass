"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

interface Props {
  user: { name?: string | null; email?: string | null; role: string | null };
}

type ReadyPass = {
  id: string;
  gatePassNumber: string;
  vehicle: string;
  chassis: string | null;
  paymentType: string | null;
  createdAt: string;
  createdBy: { name: string };
};

export default function SecurityOfficerDashboardClient({ user }: Props) {
  const [pending, setPending] = useState<ReadyPass[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gate-pass?passType=AFTER_SALES&status=APPROVED&passSubType=MAIN_OUT&limit=10")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setPending(d.passes || []);
          setTotal(d.total || 0);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#3b82f6" }}>
            Security Officer
          </p>
          <h1 className="text-3xl font-bold title-font leading-tight gradient-text">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
        </div>
        <Link
          href="/gate-pass/security-gate-out"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity mt-1"
          style={{ background: "#1B2B5E" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
          </svg>
          Gate OUT Queue
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl p-5 border"
          style={{ background: "var(--surface)", borderColor: "#3b82f666", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Awaiting Gate OUT
            </p>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#eff6ff18", color: "#3b82f6" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
          </div>
          {loading ? (
            <div className="skeleton h-10 w-14 rounded-xl" />
          ) : (
            <p className="text-5xl font-black" style={{ color: "var(--text)" }}>{total}</p>
          )}
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Vehicles ready for gate release</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-5 border flex items-center justify-center"
          style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}
        >
          <Link href="/gate-pass/security-gate-out" className="flex flex-col items-center gap-3 text-center group">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105"
              style={{ background: "#1B2B5E" }}
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
              </svg>
            </div>
            <p className="font-bold text-sm" style={{ color: "var(--text)" }}>Open Gate OUT Queue</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Confirm vehicle releases at the gate</p>
          </Link>
        </motion.div>
      </div>

      {/* Pending list */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} />
            <h2 className="font-bold text-sm" style={{ color: "var(--text)" }}>Ready for Gate Release</h2>
          </div>
          <Link href="/gate-pass/security-gate-out" className="text-xs font-semibold hover:underline" style={{ color: "#3b82f6" }}>
            View all →
          </Link>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {loading ? (
            <div className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
          ) : pending.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No vehicles awaiting gate release</div>
          ) : (
            pending.map((p) => (
              <Link
                key={p.id}
                href="/gate-pass/security-gate-out"
                className="flex items-center gap-4 px-5 py-3 hover:opacity-80 transition-opacity"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold" style={{ color: "#1d4ed8" }}>{p.gatePassNumber}</span>
                    <span className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{p.vehicle}</span>
                    {p.chassis && (
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{p.chassis}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>By {p.createdBy.name}</span>
                    {p.paymentType && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: p.paymentType === "CREDIT" ? "#eff6ff" : "#f0fdf4",
                          color: p.paymentType === "CREDIT" ? "#1d4ed8" : "#15803d",
                        }}
                      >
                        {p.paymentType === "CREDIT" ? "Credit" : "Cash"}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                  style={{ background: "#eff6ff", color: "#1d4ed8" }}
                >
                  Ready to Release
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
