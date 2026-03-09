"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { navItemsByRole } from "@/lib/nav-items";

interface SidebarProps {
  user: { name?: string | null; email?: string | null; role: string | null };
  role: string | null;
}

const roleLabels: Record<string, string> = {
  INITIATOR: "Gate Pass Initiator",
  APPROVER:  "Approver",
  RECIPIENT: "Recipient",
  ADMIN:     "Administrator",
};

const roleColors: Record<string, string> = {
  INITIATOR: "#3b82f6",
  APPROVER:  "#f59e0b",
  RECIPIENT: "#10b981",
  ADMIN:     "#8b5cf6",
};

export default function Sidebar({ user, role }: SidebarProps) {
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const { theme }  = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark   = mounted && theme === "dark";
  const navItems = navItemsByRole[role ?? ""] ?? navItemsByRole["INITIATOR"];
  const roleColor = roleColors[role ?? ""] ?? "#3b82f6";
  const lime     = "#B5CC18";

  /* ── sidebar is always dark navy — consistent colour tokens ── */
  const c = {
    text:         "rgba(255,255,255,0.38)",
    textActive:   "rgba(255,255,255,0.93)",
    dividerLabel: "rgba(255,255,255,0.20)",
    dividerLine:  "rgba(255,255,255,0.08)",
    iconBg:       "rgba(255,255,255,0.06)",
    iconActiveBg: "rgba(181,204,24,0.22)",
    itemActiveBg: "rgba(181,204,24,0.10)",
    itemHoverBg:  "rgba(255,255,255,0.05)",
    sectionBg:    "rgba(255,255,255,0.05)",
    btnBg:        "rgba(255,255,255,0.07)",
    btnColor:     "rgba(255,255,255,0.32)",
    userText:     "rgba(255,255,255,0.84)",
    userMuted:    "rgba(255,255,255,0.32)",
    iconGlow:     "0 0 12px rgba(181,204,24,0.30)",
  };

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-64 flex flex-col z-50"
      style={{
        background: mounted ? (isDark ? "#060c18" : "#0d1b3e") : "#0d1b3e",
        borderRight: `1px solid rgba(255,255,255,0.07)`,
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="relative h-11 w-[130px] mb-3">
          {mounted ? (
            <Image
              src="/logo-dark.jpg"
              alt="DIMO"
              fill
              className="object-contain object-left rounded-md"
              priority
            />
          ) : (
            <div className="h-11 w-[130px] rounded-md" style={{ background: "rgba(255,255,255,0.06)" }} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: c.dividerLine }} />
          <p className="text-[9px] uppercase tracking-[0.22em] font-semibold px-1" style={{ color: c.dividerLabel }}>
            Gate Pass System
          </p>
          <div className="flex-1 h-px" style={{ background: c.dividerLine }} />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-2">
        {navItems.map((item, i) => {
          const [hrefPath, hrefQuery] = item.href.split("?");
          const currentQuery = searchParams.toString();
          const isActive =
            hrefPath === "/"
              ? pathname === "/" && !currentQuery
              : hrefQuery
              ? pathname === hrefPath && currentQuery === hrefQuery
              : pathname === hrefPath && !searchParams.get("status");

          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Link
                href={item.href}
                className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group overflow-hidden"
                style={{
                  background: isActive ? c.itemActiveBg : "transparent",
                  color: isActive ? c.textActive : c.text,
                }}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: lime }} />
                )}
                {!isActive && (
                  <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: c.itemHoverBg }} />
                )}
                <span className="relative z-10 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ background: isActive ? c.iconActiveBg : c.iconBg, color: isActive ? lime : c.text, boxShadow: isActive ? c.iconGlow : "none" }}>
                  {item.icon}
                </span>
                <span className="relative z-10 truncate">{item.label}</span>
                {isActive && (
                  <motion.span layoutId="nav-dot" className="relative z-10 ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: lime }} />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Bottom: user info + sign out */}
      <div className="p-3" style={{ borderTop: `1px solid rgba(255,255,255,0.07)` }}>
        <div
          className="flex items-center gap-3 px-3 py-3 rounded-xl"
          style={{ background: c.sectionBg }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${roleColor}bb, ${roleColor})` }}
          >
            {user.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: c.userText }}>
              {user.name ?? "User"}
            </p>
            <p className="text-xs truncate" style={{ color: c.userMuted }}>
              {role ? (roleLabels[role] ?? role) : "No role"}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:bg-red-500/15 hover:text-red-500"
            style={{ background: c.btnBg, color: c.btnColor }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
