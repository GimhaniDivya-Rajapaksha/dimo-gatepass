"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  gatePass?: { id: string; gatePassNumber: string } | null;
}

const typeConfig: Record<string, { icon: string; bg: string; color: string; label: string; labelBg: string; labelColor: string }> = {
  GATE_PASS_SUBMITTED: { icon: "📋", bg: "#eff6ff", color: "#1d4ed8", label: "New Request",  labelBg: "#eff6ff", labelColor: "#1d4ed8" },
  GATE_PASS_APPROVED:  { icon: "✅", bg: "#f0fdf4", color: "#15803d", label: "Approved",     labelBg: "#f0fdf4", labelColor: "#15803d" },
  GATE_PASS_REJECTED:  { icon: "❌", bg: "#fef2f2", color: "#dc2626", label: "Rejected",     labelBg: "#fef2f2", labelColor: "#dc2626" },
  GATE_PASS_RECEIVED:  { icon: "🚗", bg: "#f5f3ff", color: "#5b21b6", label: "Gate Out",     labelBg: "#f5f3ff", labelColor: "#5b21b6" },
};

function getNavPath(n: Notification): string {
  if (!n.gatePass?.id) return "/";
  const id = n.gatePass.id;
  switch (n.type) {
    case "GATE_PASS_SUBMITTED": return `/gate-pass/approve/${id}`;
    case "GATE_PASS_APPROVED":
    case "GATE_PASS_REJECTED":  return `/gate-pass/${id}`;
    case "GATE_PASS_RECEIVED":  return `/recipient`;
    default:                    return `/gate-pass/${id}`;
  }
}

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    await fetch("/api/notifications/read", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function handleOpen() {
    const wasOpen = open;
    setOpen((v) => !v);
    if (!wasOpen) {
      await fetchNotifications();
      // Auto-mark all as read when panel opens
      if (unread > 0) {
        await fetch("/api/notifications/read", { method: "POST" });
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    }
  }

  function handleClick(n: Notification) {
    setOpen(false);
    router.push(getNavPath(n));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:shadow-sm"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: "#ef4444" }}
          >
            <span className="w-2 h-2 rounded-full bg-white" />
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 w-80 rounded-2xl border shadow-xl z-50 overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Notifications</span>
              {notifications.some((n) => !n.read) && (
                <button onClick={markAllRead} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-96">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl mx-auto mb-2" style={{ background: "var(--surface2)" }}>🔔</div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>No notifications yet</p>
                </div>
              ) : (
                notifications.map((n, i) => {
                  const cfg = typeConfig[n.type] || { icon: "🔔", bg: "#f3f4f6", color: "#6b7280", label: "Update", labelBg: "#f3f4f6", labelColor: "#6b7280" };
                  return (
                    <motion.button
                      key={n.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => handleClick(n)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all hover:opacity-80"
                      style={{
                        background: n.read ? "transparent" : `${cfg.bg}80`,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                        style={{ background: cfg.bg }}
                      >
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: cfg.labelBg, color: cfg.labelColor }}
                          >
                            {cfg.label}
                          </span>
                          {n.gatePass && (
                            <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-muted)" }}>
                              {n.gatePass.gatePassNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{n.message}</p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{timeAgo(n.createdAt)}</p>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
