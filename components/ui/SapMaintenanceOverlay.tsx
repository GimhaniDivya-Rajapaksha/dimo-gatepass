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

const SUPPORT_EMAIL = "application.support@dimolanka.com";

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
    d: String(Math.floor(total / 86400)).padStart(2, "0"),
    h: String(Math.floor((total % 86400) / 3600)).padStart(2, "0"),
    m: String(Math.floor((total % 3600) / 60)).padStart(2, "0"),
    s: String(total % 60).padStart(2, "0"),
  };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function TimeBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="rounded-xl px-2.5 py-2 sm:px-4 sm:py-3 text-xl sm:text-3xl font-bold tabular-nums tracking-wider"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", minWidth: "2.9rem", textAlign: "center" }}
      >
        {value}
      </div>
      <span className="mt-1.5 text-[8px] sm:text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </span>
    </div>
  );
}

// The centerpiece "processing" visual: a car icon at rest inside a rotating ring with small
// orbiting particles. All continuous motion is skipped when the visitor has asked their OS for
// reduced motion — the icon still renders, just without rotation/bobbing.
function CarProcessingAnimation({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center" aria-hidden="true">
      <div className="absolute inset-0 rounded-full" style={{ border: "2px solid rgba(255,255,255,0.1)" }} />
      <motion.div
        className="absolute inset-0"
        animate={reducedMotion ? undefined : { rotate: 360 }}
        transition={reducedMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: "linear" }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#8DC63F" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="72 217" />
        </svg>
        <span className="absolute rounded-full" style={{ width: 6, height: 6, background: "#60a5fa", top: "1%", left: "50%", transform: "translate(-50%,0)" }} />
        <span className="absolute rounded-full" style={{ width: 5, height: 5, background: "#8DC63F", top: "50%", right: "-2%", transform: "translate(0,-50%)" }} />
        <span className="absolute rounded-full" style={{ width: 4, height: 4, background: "#fff", bottom: "4%", left: "26%" }} />
      </motion.div>
      <motion.div
        className="relative z-10 w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,#1E4FA0,#2563eb)", boxShadow: "0 6px 18px -4px rgba(37,99,235,0.7)" }}
        animate={reducedMotion ? undefined : { y: [0, -2, 0] }}
        transition={reducedMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 13.3l1.4-4.1A2 2 0 016.3 8h11.4a2 2 0 011.9 1.2l1.4 4.1M3 13.3v2.8a1 1 0 001 1h1.1M3 13.3h18M20 13.3v2.8a1 1 0 01-1 1h-1.1M6.4 17.1a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm11.2 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
            stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </motion.div>
    </div>
  );
}

// Visually cycles "Processing" / "Processing." / "Processing.." / "Processing..." — purely local
// UI state on a timer, no network calls. Screen readers get one static description instead of
// the cycling text so they aren't re-announced four times a second.
function ProcessingLabel({ reducedMotion }: { reducedMotion: boolean }) {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 450);
    return () => clearInterval(id);
  }, [reducedMotion]);
  const label = reducedMotion ? "Processing" : `Processing${".".repeat(dots)}`;
  return (
    <p className="mt-3 text-[11px] sm:text-xs font-semibold uppercase tracking-widest" style={{ color: "#8DC63F" }}>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">System maintenance is in progress, please wait</span>
    </p>
  );
}

export default function SapMaintenanceOverlay({ initialStatus }: { initialStatus: MaintenanceOverlayStatus | null }) {
  const [status, setStatus] = useState<MaintenanceOverlayStatus | null>(initialStatus);
  const [now, setNow] = useState<number>(() => Date.now());
  const crossedZeroRef = useRef(false);
  const reducedMotion = useReducedMotion();

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
          aria-labelledby="sap-maintenance-heading"
        >
          <motion.div
            className="relative w-full max-w-md sm:max-w-lg rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto"
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
              <CarProcessingAnimation reducedMotion={reducedMotion} />
              <ProcessingLabel reducedMotion={reducedMotion} />

              <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: "#8DC63F" }}>
                Diesel &amp; Motor Engineering Plc.
              </div>
              <h1 id="sap-maintenance-heading" className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
                SAP System Maintenance
              </h1>
              <p className="mt-1 text-xs sm:text-sm font-semibold" style={{ color: "#93c5fd" }}>
                Planned SAP S/4 HANA Downtime
              </p>
              <p className="mt-2.5 text-xs sm:text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
                DIMO Gate Pass is temporarily unavailable while SAP system maintenance is in progress.
              </p>
              <span className="sr-only">
                Maintenance window: {formatDateTime(status?.startAt ?? null)} to {formatDateTime(status?.endAt ?? null)}, Sri Lanka time.
              </span>
            </div>

            {/* Countdown */}
            {time && (
              <div className="px-6 sm:px-10 py-5">
                <div className="flex items-center justify-center gap-1.5 sm:gap-2.5" aria-hidden="true">
                  <TimeBox value={time.d} label="Days" />
                  <span className="text-xl sm:text-2xl font-bold pb-4" style={{ color: "rgba(255,255,255,0.3)" }}>:</span>
                  <TimeBox value={time.h} label="Hours" />
                  <span className="text-xl sm:text-2xl font-bold pb-4" style={{ color: "rgba(255,255,255,0.3)" }}>:</span>
                  <TimeBox value={time.m} label="Minutes" />
                  <span className="text-xl sm:text-2xl font-bold pb-4" style={{ color: "rgba(255,255,255,0.3)" }}>:</span>
                  <TimeBox value={time.s} label="Seconds" />
                </div>
              </div>
            )}

            {/* Status strip */}
            <div className="px-6 sm:px-10 pb-4">
              <div className="rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 space-y-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Status</span>
                  <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold" style={{ color: expired ? "#fbbf24" : "#34d399" }}>
                    <span className="relative flex h-2 w-2">
                      {!reducedMotion && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: expired ? "#fbbf24" : "#34d399" }} />
                      )}
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
              </div>

              {/* Structured breakdown of the notice */}
              <div className="mt-4 rounded-2xl px-4 py-4 sm:px-5 sm:py-5 space-y-3.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8DC63F" }}>Planned Downtime</div>
                  <div className="text-[11px] sm:text-xs text-white font-medium leading-relaxed">
                    {formatDateTime(status?.startAt ?? null)} &rarr; {formatDateTime(status?.endAt ?? null)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8DC63F" }}>Reason</div>
                  <div className="text-[11px] sm:text-xs text-white font-medium leading-relaxed">SAP S/4 HANA and Proaxia Version Upgrade</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8DC63F" }}>Impact</div>
                  <div className="text-[11px] sm:text-xs text-white font-medium leading-relaxed">All DIMO SAP / VSS Users</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8DC63F" }}>Support</div>
                  <div className="text-[11px] sm:text-xs text-white font-medium leading-relaxed">
                    SAP Support Desk &mdash;{" "}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-semibold" style={{ color: "#93c5fd" }}>
                      {SUPPORT_EMAIL}
                    </a>
                  </div>
                </div>
                {status?.message && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#8DC63F" }}>Additional Note</div>
                    <div className="text-[11px] sm:text-xs text-white font-medium leading-relaxed">{status.message}</div>
                  </div>
                )}
              </div>

              {/* Verbatim notice text */}
              <div className="mt-4 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4" style={{ background: "rgba(194,65,12,0.18)", border: "1px solid rgba(194,65,12,0.4)" }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#fdba74" }}>Notice</div>
                <p className="text-[11px] sm:text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
                  <strong className="text-white">Notice: Planned SAP S/4 HANA Downtime</strong> — The{" "}
                  <strong className="text-white">DIMO SAP S/4 HANA Production System</strong> will be unavailable from{" "}
                  <strong className="text-white">Friday, 18th September 2026, 20:00 H</strong> to{" "}
                  <strong className="text-white">Sunday, 20th September 2026, 17:00 H</strong> due to the{" "}
                  <strong className="text-white">SAP S/4 HANA and Proaxia Version Upgrade</strong>. Impact:{" "}
                  <strong className="text-white">All DIMO SAP / VSS Users</strong>. For any issues, contact the{" "}
                  <strong className="text-white">SAP Support Desk</strong> at{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-semibold text-white">
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
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
