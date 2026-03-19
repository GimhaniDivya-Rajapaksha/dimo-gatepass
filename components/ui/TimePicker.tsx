"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

function pad(n: number) { return String(n).padStart(2, "0"); }

function fmtDisplay(value: string) {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${pad(h12)}:${pad(m)} ${period}`;
}

interface TimePickerProps {
  value: string;       // "HH:MM" 24-hr
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  date?: string;       // "YYYY-MM-DD" — when provided, past times are disabled if date is today
}

export default function TimePicker({
  value, onChange, placeholder = "Select time", error, date,
}: TimePickerProps) {
  // Determine if the given date is today — if so, block past times
  const nowRef = new Date();
  let isToday = false;
  if (date) {
    try {
      const d = new Date(date + "T00:00:00");
      isToday = d.getFullYear() === nowRef.getFullYear() &&
                d.getMonth()    === nowRef.getMonth() &&
                d.getDate()     === nowRef.getDate();
    } catch { /* invalid date string */ }
  }
  const minH = isToday ? nowRef.getHours() : 0;
  const minM = isToday ? nowRef.getMinutes() : 0;
  const isPastHour = (h: number) => isToday && h < minH;
  const isPastMin  = (h: number, m: number) => isToday && h === minH && m < minM;
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const curH = value ? parseInt(value.split(":")[0], 10) : -1;
  const curM = value ? parseInt(value.split(":")[1], 10) : -1;

  const hourRef      = useRef<HTMLDivElement>(null);
  const minRef       = useRef<HTMLDivElement>(null);
  const buttonRef    = useRef<HTMLButtonElement>(null);
  const popupRef     = useRef<HTMLDivElement>(null);

  const ITEM_H = 44;

  /* Calculate fixed popup position */
  function calcPos() {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const popupW = 300;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openAbove = spaceBelow < 420 && spaceAbove > spaceBelow;

    let left = r.left;
    if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
    if (left < 8) left = 8;

    setPopupStyle({
      position: "fixed",
      top: openAbove ? undefined : r.bottom + 8,
      bottom: openAbove ? window.innerHeight - r.top + 8 : undefined,
      left,
      width: popupW,
      zIndex: 9999,
    });
  }

  /* Recalculate on scroll / resize while open */
  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open]); // eslint-disable-line

  /* Scroll to selected (or current time if empty) on open */
  useEffect(() => {
    if (!open) return;
    const nowD = new Date();
    const h = curH >= 0 ? curH : nowD.getHours();
    const m = curM >= 0 ? curM : nowD.getMinutes();
    setTimeout(() => {
      hourRef.current?.scrollTo({ top: h * ITEM_H, behavior: "smooth" });
      minRef.current?.scrollTo({ top: m * ITEM_H, behavior: "smooth" });
    }, 80);
  }, [open]); // eslint-disable-line

  function selectNow() {
    const n = new Date();
    onChange(`${pad(n.getHours())}:${pad(n.getMinutes())}`);
    setTimeout(() => {
      hourRef.current?.scrollTo({ top: n.getHours() * ITEM_H, behavior: "smooth" });
      minRef.current?.scrollTo({ top: n.getMinutes() * ITEM_H, behavior: "smooth" });
    }, 50);
  }

  /* Close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        popupRef.current  && !popupRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectHour(h: number) {
    if (isPastHour(h)) return;
    const m = curM >= 0 ? curM : 0;
    // If switching to the min-hour and current minute is now past, bump minute to minM
    const safeM = (isToday && h === minH && m < minM) ? minM : m;
    onChange(`${pad(h)}:${pad(safeM)}`);
    hourRef.current?.scrollTo({ top: h * ITEM_H, behavior: "smooth" });
  }
  function selectMin(m: number) {
    const h = curH >= 0 ? curH : 0;
    if (isPastMin(h, m)) return;
    onChange(`${pad(h)}:${pad(m)}`);
    minRef.current?.scrollTo({ top: m * ITEM_H, behavior: "smooth" });
  }
  function selectPeriod(pm: boolean) {
    if (curH < 0) return;
    let h = curH;
    if (pm  && h < 12)  h += 12;
    if (!pm && h >= 12) h -= 12;
    onChange(`${pad(h)}:${pad(curM >= 0 ? curM : 0)}`);
  }

  const isPM = curH >= 12;

  const presets = [
    { label: "8:00 AM",  value: "08:00" },
    { label: "10:00 AM", value: "10:00" },
    { label: "12:00 PM", value: "12:00" },
    { label: "2:00 PM",  value: "14:00" },
    { label: "4:00 PM",  value: "16:00" },
    { label: "6:00 PM",  value: "18:00" },
  ];

  return (
    <div className="relative">
      {/* ── Trigger ── */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 border rounded-xl px-4 py-2.5 text-sm transition-all text-left"
        style={{
          background: "var(--surface2)",
          borderColor: error ? "#f87171" : open ? "#3b82f6" : "var(--border)",
          color: value ? "var(--text)" : "var(--text-muted)",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.15)" : "none",
          outline: "none",
        }}
      >
        <svg className="w-4 h-4 flex-shrink-0" style={{ color: open ? "#3b82f6" : "var(--text-muted)" }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="flex-1 font-medium">{value ? fmtDisplay(value) : placeholder}</span>
        {value && (
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onChange(""); } }}
            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-100 transition-colors flex-shrink-0 cursor-pointer"
            style={{ color: "var(--text-muted)" }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}
        {!value && (
          <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none" }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}

      {/* ── Popup — rendered at fixed position to escape overflow:hidden parents ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{  opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="rounded-2xl overflow-hidden"
            style={{
              ...popupStyle,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
            }}
          >
            {/* ── Header ── */}
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-black text-white tracking-wide">Select Time</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectNow}
                  className="px-3 py-1.5 rounded-xl text-xs font-black transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.35)", color: "white" }}
                >
                  Now
                </button>
                <div className="px-3 py-1.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <span className="text-sm font-black text-white font-mono tracking-widest">
                    {value ? fmtDisplay(value) : "— : —"}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Drum-roll picker ── */}
            <div className="flex items-stretch px-4 pt-3 pb-2 gap-2">

              {/* Hour column */}
              <div className="flex-1 flex flex-col items-center gap-1">
                <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Hour</p>
                <div className="relative w-full" style={{ height: ITEM_H * 4 }}>
                  <div className="absolute top-0 left-0 right-0 h-10 pointer-events-none z-10 rounded-t-xl"
                    style={{ background: "linear-gradient(to bottom, var(--surface), transparent)" }} />
                  <div className="absolute left-0 right-0 pointer-events-none z-10 rounded-xl"
                    style={{ top: ITEM_H * 1.5, height: ITEM_H, background: "rgba(59,130,246,0.1)", border: "1.5px solid rgba(59,130,246,0.3)" }} />
                  <div
                    ref={hourRef}
                    className="absolute inset-0 overflow-y-auto scrollbar-hide"
                    style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" }}
                    onScroll={(e) => {
                      const top = (e.target as HTMLDivElement).scrollTop;
                      let h = Math.round(top / ITEM_H);
                      if (isPastHour(h)) { h = minH; hourRef.current?.scrollTo({ top: minH * ITEM_H, behavior: "smooth" }); }
                      const m = curM >= 0 ? curM : 0;
                      const safeM = (isToday && h === minH && m < minM) ? minM : m;
                      if (h !== curH) onChange(`${pad(h)}:${pad(safeM)}`);
                    }}
                  >
                    <div style={{ paddingTop: ITEM_H * 1.5, paddingBottom: ITEM_H * 1.5 }}>
                      {Array.from({ length: 24 }, (_, i) => {
                        const h12v = i === 0 ? 12 : i > 12 ? i - 12 : i;
                        const period = i >= 12 ? "PM" : "AM";
                        const sel = i === curH;
                        const past = isPastHour(i);
                        return (
                          <div key={i}
                            onClick={() => selectHour(i)}
                            className="flex items-center justify-center transition-all"
                            style={{
                              height: ITEM_H,
                              scrollSnapAlign: "center",
                              fontWeight: sel ? 800 : 500,
                              fontSize: sel ? "17px" : "13px",
                              color: past ? "var(--text-muted)" : sel ? "#2563eb" : "var(--text-muted)",
                              opacity: past ? 0.3 : 1,
                              cursor: past ? "not-allowed" : "pointer",
                              transform: sel ? "scale(1.1)" : "scale(1)",
                            }}>
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{pad(h12v)}</span>
                            <span className="text-[10px] ml-1" style={{ color: sel ? "#93c5fd" : "var(--text-muted)", opacity: 0.7 }}>{period}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none z-10 rounded-b-xl"
                    style={{ background: "linear-gradient(to top, var(--surface), transparent)" }} />
                </div>
              </div>

              {/* Colon divider */}
              <div className="flex items-center justify-center w-5 pb-1">
                <span className="text-2xl font-black" style={{ color: "var(--text-muted)" }}>:</span>
              </div>

              {/* Minute column */}
              <div className="flex-1 flex flex-col items-center gap-1">
                <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Min</p>
                <div className="relative w-full" style={{ height: ITEM_H * 4 }}>
                  <div className="absolute top-0 left-0 right-0 h-10 pointer-events-none z-10 rounded-t-xl"
                    style={{ background: "linear-gradient(to bottom, var(--surface), transparent)" }} />
                  <div className="absolute left-0 right-0 pointer-events-none z-10 rounded-xl"
                    style={{ top: ITEM_H * 1.5, height: ITEM_H, background: "rgba(59,130,246,0.1)", border: "1.5px solid rgba(59,130,246,0.3)" }} />
                  <div
                    ref={minRef}
                    className="absolute inset-0 overflow-y-auto"
                    style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" }}
                    onScroll={(e) => {
                      const top = (e.target as HTMLDivElement).scrollTop;
                      let m = Math.round(top / ITEM_H);
                      const h = curH >= 0 ? curH : 0;
                      if (isPastMin(h, m)) { m = minM; minRef.current?.scrollTo({ top: minM * ITEM_H, behavior: "smooth" }); }
                      if (m !== curM) onChange(`${pad(h)}:${pad(m)}`);
                    }}
                  >
                    <div style={{ paddingTop: ITEM_H * 1.5, paddingBottom: ITEM_H * 1.5 }}>
                      {Array.from({ length: 60 }, (_, i) => {
                        const sel = i === curM;
                        const past = isPastMin(curH >= 0 ? curH : 0, i);
                        return (
                          <div key={i}
                            onClick={() => selectMin(i)}
                            className="flex items-center justify-center transition-all"
                            style={{
                              height: ITEM_H,
                              scrollSnapAlign: "center",
                              fontWeight: sel ? 800 : 500,
                              fontSize: sel ? "17px" : "13px",
                              color: past ? "var(--text-muted)" : sel ? "#2563eb" : "var(--text-muted)",
                              opacity: past ? 0.3 : 1,
                              cursor: past ? "not-allowed" : "pointer",
                              transform: sel ? "scale(1.1)" : "scale(1)",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                            {pad(i)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none z-10 rounded-b-xl"
                    style={{ background: "linear-gradient(to top, var(--surface), transparent)" }} />
                </div>
              </div>

              {/* AM / PM toggle */}
              <div className="flex flex-col items-center gap-1 w-12">
                <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Period</p>
                <div className="flex flex-col gap-2 mt-6 w-full">
                  {[false, true].map((pm) => (
                    <button
                      key={String(pm)}
                      type="button"
                      onClick={() => selectPeriod(pm)}
                      className="w-full py-2 rounded-xl text-xs font-black transition-all"
                      style={{
                        background: (pm ? isPM : !isPM) && value
                          ? "linear-gradient(135deg,#1e3a8a,#2563eb)"
                          : "var(--surface2)",
                        color: (pm ? isPM : !isPM) && value ? "white" : "var(--text-muted)",
                        border: `1.5px solid ${(pm ? isPM : !isPM) && value ? "#2563eb" : "var(--border)"}`,
                        boxShadow: (pm ? isPM : !isPM) && value ? "0 2px 8px rgba(37,99,235,0.4)" : "none",
                      }}>
                      {pm ? "PM" : "AM"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Quick presets ── */}
            <div className="px-4 pb-4 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Quick Select</p>
              <div className="grid grid-cols-3 gap-1.5">
                {presets.map((p) => {
                  const sel = value === p.value;
                  const [ph, pm2] = p.value.split(":").map(Number);
                  const pastPreset = isPastHour(ph) || isPastMin(ph, pm2);
                  return (
                    <button
                      key={p.value}
                      type="button"
                      disabled={pastPreset}
                      onClick={() => { if (!pastPreset) { onChange(p.value); setOpen(false); } }}
                      className="py-2 rounded-xl text-[11px] font-bold transition-all"
                      style={{
                        background: pastPreset ? "var(--surface2)" : sel ? "linear-gradient(135deg,#1e3a8a,#2563eb)" : "var(--surface2)",
                        color: pastPreset ? "var(--text-muted)" : sel ? "white" : "var(--text-muted)",
                        border: `1px solid ${pastPreset ? "var(--border)" : sel ? "#2563eb" : "var(--border)"}`,
                        opacity: pastPreset ? 0.35 : 1,
                        cursor: pastPreset ? "not-allowed" : "pointer",
                        boxShadow: sel && !pastPreset ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
                      }}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
