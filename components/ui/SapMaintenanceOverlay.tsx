"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type MaintenanceOverlayStatus = {
  enabled: boolean;
  message: string | null;
  startAt: string | null;
  endAt: string | null;
};

// How often we poll for admin changes (extend/disable) while the overlay is showing (or could
// start showing). The countdown itself never triggers a request — it's pure client-side math
// ticking every second from `endAt`. We also do one extra immediate check the instant the
// countdown crosses zero, so "maintenance should be over now" reflects reality quickly without
// waiting up to a full poll interval.
const POLL_MS = 30_000;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

function splitRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    h: String(Math.floor(total / 3600)).padStart(2, "0"),
    m: String(Math.floor((total % 3600) / 60)).padStart(2, "0"),
    s: String(total % 60).padStart(2, "0"),
  };
}

function TimeBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-2xl sm:text-4xl font-bold tabular-nums tracking-wider"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", minWidth: "3.25rem", textAlign: "center" }}
      >
        {value}
      </div>
      <span className="mt-1.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </span>
    </div>
  );
}

export default function SapMaintenanceOverlay({ initialStatus }: { initialStatus: MaintenanceOverlayStatus | null }) {
  const [status, setStatus] = useState<MaintenanceOverlayStatus | null>(initialStatus);
  const [now, setNow] = useState<number>(() => Date.now());
  const crossedZeroRef = useRef(false);

  async function refresh() {
    try {
      const res = await fetch("/api/maintenance-status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as MaintenanceOverlayStatus;
      setStatus(data);
    } catch {
      // Transient network error — keep showing whatever we last had; the next poll retries.
    }
  }

  useEffect(() => {
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!status?.enabled || !status.endAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status?.enabled, status?.endAt]);

  const endMs = status?.endAt ? new Date(status.endAt).getTime() : null;
  const remainingMs = endMs != null ? endMs - now : null;
  const expired = remainingMs != null && remainingMs <= 0;

  useEffect(() => {
    if (expired && !crossedZeroRef.current) {
      crossedZeroRef.current = true;
      void refresh();
    } else if (!expired) {
      crossedZeroRef.current = false;
    }
  }, [expired]);

  const visible = !!status?.enabled;
  const time = remainingMs != null ? splitRemaining(remainingMs) : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 9999, background: "rgba(6,12,28,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          role="alert"
          aria-live="polite"
        >
          <motion.div
            className="relative w-full max-w-md sm:max-w-lg rounded-3xl overflow-hidden"
            style={{
              background: "linear-gradient(160deg,#0d1b3e 0%,#13275c 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 25px 70px -15px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
          >
            {/* Header */}
            <div className="flex flex-col items-center text-center px-6 pt-8 pb-2 sm:px-10 sm:pt-10">
              <motion.div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: "linear-gradient(135deg,#1E4FA0,#2563eb)", boxShadow: "0 8px 24px -6px rgba(37,99,235,0.6)" }}
                animate={{ boxShadow: ["0 8px 24px -6px rgba(37,99,235,0.5)", "0 8px 32px -4px rgba(37,99,235,0.85)", "0 8px 24px -6px rgba(37,99,235,0.5)"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l1.8 3.6L18 6.2l-3.2 2.5.9 4L12 10.6 8.3 12.7l.9-4L6 6.2l4.2-.6L12 2z" fill="#8DC63F" />
                  <circle cx="12" cy="12" r="9.5" stroke="#fff" strokeWidth="1.3" strokeOpacity="0.35" />
                  <path d="M12 6.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" stroke="#fff" strokeWidth="1.3" strokeOpacity="0.7" />
                </svg>
              </motion.div>

              <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: "#8DC63F" }}>
                Diesel &amp; Motor Engineering Plc.
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">SAP System Maintenance</h1>
              <p className="mt-2.5 text-xs sm:text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
                DIMO Gate Pass is temporarily unavailable while SAP system maintenance is in progress.
              </p>
              {status?.message && (
                <p className="mt-2 text-xs sm:text-sm font-medium" style={{ color: "#93c5fd" }}>
                  {status.message}
                </p>
              )}
            </div>

            {/* Countdown */}
            {time && (
              <div className="px-6 sm:px-10 py-5">
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  <TimeBox value={time.h} label="Hours" />
                  <span className="text-2xl sm:text-3xl font-bold pb-4" style={{ color: "rgba(255,255,255,0.3)" }}>:</span>
                  <TimeBox value={time.m} label="Minutes" />
                  <span className="text-2xl sm:text-3xl font-bold pb-4" style={{ color: "rgba(255,255,255,0.3)" }}>:</span>
                  <TimeBox value={time.s} label="Seconds" />
                </div>
              </div>
            )}

            {/* Details */}
            <div className="px-6 sm:px-10 pb-6">
              <div className="rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 space-y-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Status</span>
                  <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold" style={{ color: expired ? "#fbbf24" : "#34d399" }}>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: expired ? "#fbbf24" : "#34d399" }} />
                      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: expired ? "#fbbf24" : "#34d399" }} />
                    </span>
                    {expired ? "Finalizing" : "In Progress"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>System</span>
                  <span className="text-[11px] sm:text-xs font-semibold text-white">SAP S/4HANA</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Maintenance Type</span>
                  <span className="text-[11px] sm:text-xs font-semibold text-white">Planned System Maintenance</span>
                </div>
                {status?.endAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] sm:text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Expected Completion</span>
                    <span className="text-[11px] sm:text-xs font-semibold text-white">{formatDateTime(status.endAt)}</span>
                  </div>
                )}
              </div>

              {expired && (
                <p className="mt-3 text-center text-[11px] sm:text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                  The expected completion time has passed — maintenance is taking a little longer than planned. This page checks again automatically.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
