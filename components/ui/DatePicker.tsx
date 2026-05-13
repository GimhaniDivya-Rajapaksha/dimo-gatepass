"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) { return String(n).padStart(2, "0"); }
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYMD(s: string) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDisplay(s: string) {
  const d = parseYMD(s);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

interface DatePickerProps {
  value: string;        // "YYYY-MM-DD"
  onChange: (v: string) => void;
  min?: string;         // "YYYY-MM-DD" — no dates before this
  max?: string;
  placeholder?: string;
  error?: string;
  label?: string;
  required?: boolean;
}

export default function DatePicker({
  value, onChange, min, max, placeholder = "Select date", error,
}: DatePickerProps) {
  const today = toYMD(new Date());
  const effectiveMin = min || today;

  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef  = useRef<HTMLDivElement>(null);

  /* current calendar view month */
  const initDate = value ? parseYMD(value)! : (parseYMD(effectiveMin) ?? new Date());
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  /* Calculate fixed popup position from button rect */
  function calcPos() {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const popupW = 320;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openAbove = spaceBelow < 370 && spaceAbove > spaceBelow;

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

  function prevMonth() {
    setDir(-1);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    setDir(1);
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  /* build day grid */
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev  = new Date(viewYear, viewMonth, 0).getDate();

  const cells: { date: string; cur: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ date: `${viewYear}-${pad(viewMonth === 0 ? 12 : viewMonth)}-${pad(d)}`, cur: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`, cur: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: `${viewYear}-${pad(viewMonth === 11 ? 1 : viewMonth + 2)}-${pad(d)}`, cur: false });
  }

  function select(date: string) {
    onChange(date);
    setOpen(false);
  }

  function isDisabled(date: string) {
    if (effectiveMin && date < effectiveMin) return true;
    if (max && date > max) return false;
    return false;
  }

  const monthKey = `${viewYear}-${viewMonth}`;

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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="flex-1">{value ? fmtDisplay(value) : placeholder}</span>
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

      {/* ── Calendar popup — rendered at fixed position to escape overflow:hidden parents ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{  opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="rounded-2xl shadow-2xl overflow-hidden"
            style={{
              ...popupStyle,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
            }}
          >
            {/* ── Header ── */}
            <div className="px-5 pt-4 pb-3 flex items-center gap-2"
              style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
              <button type="button" onClick={prevMonth}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
                style={{ color: "rgba(255,255,255,0.9)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex-1 text-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={monthKey}
                    initial={{ opacity: 0, x: dir * 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{   opacity: 0, x: dir * -20 }}
                    transition={{ duration: 0.18 }}
                    className="text-sm font-black text-white tracking-wide"
                  >
                    {MONTHS[viewMonth]} {viewYear}
                  </motion.p>
                </AnimatePresence>
              </div>
              <button type="button" onClick={nextMonth}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
                style={{ color: "rgba(255,255,255,0.9)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* ── Day-of-week headers ── */}
            <div className="grid grid-cols-7 px-3 pt-3 pb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest py-1"
                  style={{ color: d === "Su" || d === "Sa" ? "#94a3b8" : "var(--text-muted)" }}>
                  {d}
                </div>
              ))}
            </div>

            {/* ── Date grid ── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={monthKey}
                initial={{ opacity: 0, x: dir * 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{   opacity: 0, x: dir * -30 }}
                transition={{ duration: 0.18 }}
                className="grid grid-cols-7 gap-0.5 px-3 pb-4"
              >
                {cells.map(({ date, cur }, idx) => {
                  const disabled = isDisabled(date);
                  const isToday  = date === today;
                  const selected = date === value;
                  const dayNum   = parseInt(date.split("-")[2], 10);
                  const colIdx   = idx % 7;
                  const isWeekend = colIdx === 0 || colIdx === 6;

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={disabled}
                      onClick={() => select(date)}
                      className="relative flex items-center justify-center rounded-xl transition-all"
                      style={{
                        height: 36,
                        fontSize: "13px",
                        fontWeight: selected ? 800 : isToday ? 700 : 500,
                        cursor: disabled ? "not-allowed" : "pointer",
                        background: selected
                          ? "linear-gradient(135deg,#1e3a8a,#2563eb)"
                          : isToday && !selected
                          ? "rgba(59,130,246,0.12)"
                          : "transparent",
                        color: selected
                          ? "white"
                          : disabled
                          ? "var(--text-muted)"
                          : !cur
                          ? "var(--text-muted)"
                          : isWeekend
                          ? "#94a3b8"
                          : "var(--text)",
                        opacity: disabled ? 0.35 : 1,
                        boxShadow: isToday && !selected ? "0 0 0 1.5px #3b82f6" : "none",
                        textDecoration: disabled ? "line-through" : "none",
                      }}
                    >
                      {dayNum}
                      {isToday && !selected && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
                      )}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>

            {/* ── Footer: Today shortcut ── */}
            <div className="px-4 pb-4 pt-1 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--border)" }}>
              <button type="button"
                disabled={isDisabled(today)}
                onClick={() => { select(today); setViewYear(new Date().getFullYear()); setViewMonth(new Date().getMonth()); }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                style={{ background: "rgba(59,130,246,0.1)", color: "#2563eb" }}>
                Today
              </button>
              {value && (
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  {fmtDisplay(value)}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
