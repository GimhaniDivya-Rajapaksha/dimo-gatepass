"use client";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import NotificationBell from "./NotificationBell";

interface DashboardHeaderProps {
  user: { name?: string | null; role: string | null };
}

const pageInfo: Record<string, { title: string; subtitle: string }> = {
  "/initiator":         { title: "Dashboard",        subtitle: "Overview of your gate passes" },
  "/approver":          { title: "Dashboard",        subtitle: "Approval queue overview" },
  "/recipient":         { title: "Dashboard",        subtitle: "Incoming vehicles overview" },
  "/admin":             { title: "User Management",  subtitle: "Manage system users" },
  "/gate-pass":         { title: "Gate Passes",      subtitle: "All gate pass records" },
  "/gate-pass/create":  { title: "Create Gate Pass", subtitle: "Submit a new gate pass request" },
  "/gate-pass/approve": { title: "New Requests",     subtitle: "Review pending approvals" },
  "/gate-pass/receive": { title: "Receive Vehicles", subtitle: "Acknowledge incoming vehicles" },
};

const roleColors: Record<string, string> = {
  INITIATOR: "#3b82f6",
  APPROVER:  "#f59e0b",
  RECIPIENT: "#10b981",
  ADMIN:     "#8b5cf6",
};

const roleBadges: Record<string, string> = {
  INITIATOR: "Gate Pass Initiator",
  APPROVER:  "Approver",
  RECIPIENT: "Recipient",
  ADMIN:     "Admin",
};

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

export default function DashboardHeader({ user }: DashboardHeaderProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";

  const info =
    pageInfo[pathname] ??
    (pathname.startsWith("/gate-pass/")
      ? { title: "Gate Pass Detail", subtitle: "Pass details & timeline" }
      : { title: "Gate Pass System", subtitle: "" });

  const roleColor = roleColors[user.role ?? ""] ?? "#3b82f6";
  const badge = roleBadges[user.role ?? ""] ?? user.role ?? "";

  return (
    <header
      className="h-16 flex items-center justify-between px-6 sticky top-0 z-40 border-b"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Left: page title */}
      <div>
        <h1 className="text-lg font-bold leading-tight title-font" style={{ color: "var(--text)" }}>
          {info.title}
        </h1>
        {info.subtitle && (
          <p className="text-xs leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>
            {info.subtitle}
          </p>
        )}
      </div>

      {/* Right: theme toggle + bell + user */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        {mounted && (
          <motion.button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            whileTap={{ scale: 0.9 }}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{
              background: isDark ? "rgba(59,130,246,0.12)" : "var(--surface2)",
              color: isDark ? "#93c5fd" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? "sun" : "moon"}
                initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.2 }}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}

        <NotificationBell />

        <div className="w-px h-6 mx-1" style={{ background: "var(--border)" }} />

        {/* User info */}
        <div className="flex items-center gap-2.5">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text)" }}>
              {user.name ?? "User"}
            </p>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: roleColor }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {badge}
              </span>
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
            style={{ background: `linear-gradient(135deg, ${roleColor}99, ${roleColor})` }}
          >
            {user.name?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </div>
    </header>
  );
}
