"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

interface Props {
  user: { name?: string | null; email?: string | null; role: string | null };
}

type ReviewPass = {
  id: string;
  gatePassNumber: string;
  vehicle: string;
  chassis: string | null;
  serviceJobNo: string | null;
  createdAt: string;
  createdBy: { name: string };
};

export default function CashierDashboardClient({ user }: Props) {
  const [pending, setPending] = useState<ReviewPass[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gate-pass?passType=AFTER_SALES&status=CASHIER_REVIEW&limit=10")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setPending(d.passes || []); setTotal(d.total || 0); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--lime)" }}>
            Cashier
          </p>
          <h1 className="text-3xl font-bold title-font leading-tight gradient-text">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
        </div>
        <Link
          href="/gate-pass/cashier-review"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity mt-1"
          style={{ background: "#1B2B5E" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Review Orders
        </Link>
      </div>

      {/* Stat card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl p-5 border"
          style={{ background: "var(--surface)", borderColor: "#f59e0b66", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Pending Order Review</p>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#fef3c718", color: "#f59e0b" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          {loading ? (
            <div className="skeleton h-10 w-14 rounded-xl" />
          ) : (
            <p className="text-5xl font-black" style={{ color: "var(--text)" }}>{total}</p>
          )}
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Gate passes awaiting cashier order check</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl p-5 border flex items-center justify-center"
          style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}
        >
          <Link
            href="/gate-pass/cashier-review"
            className="flex flex-col items-center gap-3 text-center group"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105"
              style={{ background: "#1B2B5E" }}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-bold text-sm" style={{ color: "var(--text)" }}>Go to Order Review</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Review service orders &amp; set payment status</p>
          </Link>
        </motion.div>
      </div>

      {/* Pending review table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />
            <h2 className="font-bold text-sm" style={{ color: "var(--text)" }}>Awaiting Your Review</h2>
          </div>
          <Link href="/gate-pass/cashier-review" className="text-xs font-semibold hover:underline" style={{ color: "#3b82f6" }}>
            View all →
          </Link>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {loading ? (
            <div className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
          ) : pending.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No pending reviews — all clear!</div>
          ) : pending.map((p) => (
            <Link key={p.id} href={`/gate-pass/cashier-review`}
              className="flex items-center gap-4 px-5 py-3 hover:opacity-80 transition-opacity">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold" style={{ color: "#1d4ed8" }}>{p.gatePassNumber}</span>
                  <span className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{p.vehicle}</span>
                  {p.chassis && <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{p.chassis}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {p.serviceJobNo && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded font-semibold" style={{ background: "#fef3c7", color: "#b45309" }}>
                      Job: {p.serviceJobNo}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>By {p.createdBy.name}</span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0" style={{ background: "#fef3c7", color: "#b45309" }}>
                Cashier Review
              </span>
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
