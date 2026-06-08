"use client";
import { useState, useRef, useEffect } from "react";

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
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  date?: string;
  minTime?: string;
}

const PRESETS = [
  { label: "8:00 AM",  value: "08:00" },
  { label: "10:00 AM", value: "10:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "2:00 PM",  value: "14:00" },
  { label: "4:00 PM",  value: "16:00" },
  { label: "6:00 PM",  value: "18:00" },
];

const ITEM_H = 40;

export default function TimePicker({
  value, onChange, placeholder = "Select time", error, date, minTime,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const buttonRef    = useRef<HTMLButtonElement>(null);
  const popupRef     = useRef<HTMLDivElement>(null);
  const hourRef      = useRef<HTMLDivElement>(null);
  const minRef       = useRef<HTMLDivElement>(null);
  // Prevents onScroll from firing when we programmatically scroll the drums
  const suppressRef  = useRef(false);

  // Floor time
  const now = new Date();
  let isToday = false;
  if (date) {
    try {
      const d = new Date(date + "T00:00:00");
      isToday = d.getFullYear() === now.getFullYear() &&
                d.getMonth()    === now.getMonth() &&
                d.getDate()     === now.getDate();
    } catch { /* ignore */ }
  }
  const floorH = minTime ? parseInt(minTime.split(":")[0], 10) : (isToday ? now.getHours() : 0);
  const floorM = minTime ? parseInt(minTime.split(":")[1], 10) : (isToday ? now.getMinutes() : 0);
  const hasFloor = isToday || !!minTime;

  const curH = value ? parseInt(value.split(":")[0], 10) : -1;
  const curM = value ? parseInt(value.split(":")[1], 10) : -1;
  const isPM = curH >= 12;

  function isPastHour(h: number) { return hasFloor && h < floorH; }
  function isPastMin(h: number, m: number) { return hasFloor && h === floorH && m < floorM; }
  function isPastPreset(v: string) {
    if (!hasFloor) return false;
    const [h, m] = v.split(":").map(Number);
    return h < floorH || (h === floorH && m <= floorM);
  }

  // Programmatically scroll drums (suppresses the onScroll handler)
  function scrollDrums(h: number, m: number, smooth = true) {
    suppressRef.current = true;
    hourRef.current?.scrollTo({ top: h * ITEM_H, behavior: smooth ? "smooth" : "instant" as ScrollBehavior });
    minRef.current?.scrollTo({ top: m * ITEM_H, behavior: smooth ? "smooth" : "instant" as ScrollBehavior });
    setTimeout(() => { suppressRef.current = false; }, 400);
  }

  // Scroll to selected time when popup opens
  useEffect(() => {
    if (!open) return;
    const h = curH >= 0 ? curH : now.getHours();
    const m = curM >= 0 ? curM : now.getMinutes();
    setTimeout(() => scrollDrums(h, m), 80);
  }, [open]); // eslint-disable-line

  // Popup position
  function calcPos() {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const popupW = 300;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openAbove = spaceBelow < 500 && spaceAbove > spaceBelow;
    let left = r.left;
    if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
    if (left < 8) left = 8;
    setPopupStyle({
      position: "fixed",
      top: openAbove ? undefined : r.bottom + 6,
      bottom: openAbove ? window.innerHeight - r.top + 6 : undefined,
      left, width: popupW, zIndex: 9999,
    });
  }
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

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        popupRef.current  && !popupRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectNow() {
    const n = new Date();
    const v = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    onChange(v);
    scrollDrums(n.getHours(), n.getMinutes());
    setOpen(false);
  }

  function selectHour(h: number) {
    if (isPastHour(h)) return;
    const m = curM >= 0 ? curM : 0;
    const safeM = hasFloor && h === floorH && m < floorM ? floorM : m;
    onChange(`${pad(h)}:${pad(safeM)}`);
    suppressRef.current = true;
    hourRef.current?.scrollTo({ top: h * ITEM_H, behavior: "smooth" });
    setTimeout(() => { suppressRef.current = false; }, 400);
  }

  function selectMin(m: number) {
    const h = curH >= 0 ? curH : 0;
    if (isPastMin(h, m)) return;
    onChange(`${pad(h)}:${pad(m)}`);
    suppressRef.current = true;
    minRef.current?.scrollTo({ top: m * ITEM_H, behavior: "smooth" });
    setTimeout(() => { suppressRef.current = false; }, 400);
  }

  function selectPeriod(pm: boolean) {
    if (curH < 0) return;
    let h = curH;
    if (pm  && h < 12) h += 12;
    if (!pm && h >= 12) h -= 12;
    onChange(`${pad(h)}:${pad(curM >= 0 ? curM : 0)}`);
    suppressRef.current = true;
    hourRef.current?.scrollTo({ top: h * ITEM_H, behavior: "smooth" });
    setTimeout(() => { suppressRef.current = false; }, 400);
  }

  // Native input change — update value AND sync drums
  function handleTypeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    if (v) {
      const [h, m] = v.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) scrollDrums(h, m);
    }
  }

  // Preset click — update value AND sync drums
  function selectPreset(v: string) {
    onChange(v);
    const [h, m] = v.split(":").map(Number);
    scrollDrums(h, m);
    setOpen(false);
  }

  return (
    <div className="relative">
      {/* Trigger */}
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
        {value ? (
          <span role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onChange(""); } }}
            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-100 transition-colors flex-shrink-0 cursor-pointer"
            style={{ color: "var(--text-muted)" }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none" }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div ref={popupRef} style={{
          ...popupStyle,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "0 16px 48px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}>

          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-bold text-white">
                {value ? fmtDisplay(value) : "Select Time"}
              </span>
            </div>
            <button type="button" onClick={selectNow}
              className="px-3 py-1 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
              style={{ background: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.3)", color: "white" }}>
              Now
            </button>
          </div>

          {/* Type input */}
          <div className="px-4 pt-3 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Type Time</p>
            <div className="flex gap-2">
              <input
                type="time"
                value={value || ""}
                onChange={handleTypeInput}
                className="flex-1 border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              {value && (
                <button type="button" onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)" }}>
                  OK
                </button>
              )}
            </div>
          </div>

          {/* Scroll drums */}
          <div className="px-4 pt-2 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Scroll</p>
            <div className="flex items-stretch gap-2">

              {/* Hour drum */}
              <div className="flex-1 flex flex-col items-center">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>HH</p>
                <div className="relative w-full" style={{ height: ITEM_H * 3 }}>
                  <div className="absolute top-0 left-0 right-0 h-8 pointer-events-none z-10"
                    style={{ background: "linear-gradient(to bottom, var(--surface), transparent)" }} />
                  <div className="absolute left-0 right-0 z-10 rounded-lg pointer-events-none"
                    style={{ top: ITEM_H, height: ITEM_H, background: "rgba(59,130,246,0.08)", border: "1.5px solid rgba(59,130,246,0.25)" }} />
                  <div ref={hourRef}
                    className="absolute inset-0 overflow-y-auto"
                    style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
                    onScroll={(e) => {
                      if (suppressRef.current) return;
                      const h = Math.round((e.target as HTMLDivElement).scrollTop / ITEM_H);
                      if (isPastHour(h)) {
                        suppressRef.current = true;
                        hourRef.current?.scrollTo({ top: floorH * ITEM_H, behavior: "smooth" });
                        setTimeout(() => { suppressRef.current = false; }, 400);
                        return;
                      }
                      const m = curM >= 0 ? curM : 0;
                      const safeM = hasFloor && h === floorH && m < floorM ? floorM : m;
                      if (h !== curH) onChange(`${pad(h)}:${pad(safeM)}`);
                    }}>
                    <div style={{ paddingTop: ITEM_H, paddingBottom: ITEM_H }}>
                      {Array.from({ length: 24 }, (_, i) => {
                        const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
                        const sel  = i === curH;
                        const past = isPastHour(i);
                        return (
                          <div key={i} onClick={() => selectHour(i)}
                            className="flex items-center justify-center select-none"
                            style={{
                              height: ITEM_H, scrollSnapAlign: "center",
                              fontWeight: sel ? 800 : 500,
                              fontSize: sel ? 16 : 13,
                              color: past ? "var(--text-muted)" : sel ? "#2563eb" : "var(--text-muted)",
                              opacity: past ? 0.3 : 1,
                              cursor: past ? "not-allowed" : "pointer",
                              transform: sel ? "scale(1.12)" : "scale(1)",
                              transition: "transform 0.1s",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                            {pad(h12)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none z-10"
                    style={{ background: "linear-gradient(to top, var(--surface), transparent)" }} />
                </div>
              </div>

              {/* Colon */}
              <div className="flex items-center justify-center w-4">
                <span className="text-xl font-black" style={{ color: "var(--text-muted)" }}>:</span>
              </div>

              {/* Minute drum */}
              <div className="flex-1 flex flex-col items-center">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>MM</p>
                <div className="relative w-full" style={{ height: ITEM_H * 3 }}>
                  <div className="absolute top-0 left-0 right-0 h-8 pointer-events-none z-10"
                    style={{ background: "linear-gradient(to bottom, var(--surface), transparent)" }} />
                  <div className="absolute left-0 right-0 z-10 rounded-lg pointer-events-none"
                    style={{ top: ITEM_H, height: ITEM_H, background: "rgba(59,130,246,0.08)", border: "1.5px solid rgba(59,130,246,0.25)" }} />
                  <div ref={minRef}
                    className="absolute inset-0 overflow-y-auto"
                    style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
                    onScroll={(e) => {
                      if (suppressRef.current) return;
                      const m = Math.round((e.target as HTMLDivElement).scrollTop / ITEM_H);
                      const h = curH >= 0 ? curH : 0;
                      if (isPastMin(h, m)) {
                        suppressRef.current = true;
                        minRef.current?.scrollTo({ top: floorM * ITEM_H, behavior: "smooth" });
                        setTimeout(() => { suppressRef.current = false; }, 400);
                        return;
                      }
                      if (m !== curM) onChange(`${pad(h)}:${pad(m)}`);
                    }}>
                    <div style={{ paddingTop: ITEM_H, paddingBottom: ITEM_H }}>
                      {Array.from({ length: 60 }, (_, i) => {
                        const sel  = i === curM;
                        const past = isPastMin(curH >= 0 ? curH : 0, i);
                        return (
                          <div key={i} onClick={() => selectMin(i)}
                            className="flex items-center justify-center select-none"
                            style={{
                              height: ITEM_H, scrollSnapAlign: "center",
                              fontWeight: sel ? 800 : 500,
                              fontSize: sel ? 16 : 13,
                              color: past ? "var(--text-muted)" : sel ? "#2563eb" : "var(--text-muted)",
                              opacity: past ? 0.3 : 1,
                              cursor: past ? "not-allowed" : "pointer",
                              transform: sel ? "scale(1.12)" : "scale(1)",
                              transition: "transform 0.1s",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                            {pad(i)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none z-10"
                    style={{ background: "linear-gradient(to top, var(--surface), transparent)" }} />
                </div>
              </div>

              {/* AM / PM */}
              <div className="flex flex-col items-center gap-1 w-12">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>AM/PM</p>
                <div className="flex flex-col gap-2 mt-4 w-full">
                  {[false, true].map((pm) => (
                    <button key={String(pm)} type="button" onClick={() => selectPeriod(pm)}
                      className="w-full py-2 rounded-xl text-xs font-black transition-all"
                      style={{
                        background: (pm ? isPM : !isPM) && value ? "linear-gradient(135deg,#1e3a8a,#2563eb)" : "var(--surface2)",
                        color: (pm ? isPM : !isPM) && value ? "white" : "var(--text-muted)",
                        border: `1.5px solid ${(pm ? isPM : !isPM) && value ? "#2563eb" : "var(--border)"}`,
                        boxShadow: (pm ? isPM : !isPM) && value ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
                      }}>
                      {pm ? "PM" : "AM"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick presets */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Quick Select</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => {
                const sel  = value === p.value;
                const past = isPastPreset(p.value);
                return (
                  <button key={p.value} type="button" disabled={past}
                    onClick={() => { if (!past) selectPreset(p.value); }}
                    className="py-2 rounded-xl text-[11px] font-bold transition-all"
                    style={{
                      background: sel ? "linear-gradient(135deg,#1e3a8a,#2563eb)" : "var(--surface2)",
                      color: past ? "var(--text-muted)" : sel ? "white" : "var(--text-muted)",
                      border: `1px solid ${sel ? "#2563eb" : "var(--border)"}`,
                      opacity: past ? 0.35 : 1,
                      cursor: past ? "not-allowed" : "pointer",
                      boxShadow: sel ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
                    }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
