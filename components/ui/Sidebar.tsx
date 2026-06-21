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
  INITIATOR:            "Gate Pass Initiator",
  APPROVER:             "Approver",
  RECIPIENT:            "Recipient",
  ADMIN:                "Administrator",
  CASHIER:              "Cashier",
  AREA_SALES_OFFICER:   "Area Sales Officer",
  SECURITY_OFFICER:     "Security Officer",
  DELIVERY_COORDINATOR: "Delivery Coordinator",
};

const roleColors: Record<string, string> = {
  INITIATOR:            "#3b82f6",
  APPROVER:             "#f59e0b",
  RECIPIENT:            "#10b981",
  ADMIN:                "#8b5cf6",
  CASHIER:              "#f59e0b",
  AREA_SALES_OFFICER:   "#06b6d4",
  SECURITY_OFFICER:     "#1d4ed8",
  DELIVERY_COORDINATOR: "#0d9488",
};

export default function Sidebar({ user, role }: SidebarProps) {
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const { theme }  = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [overrideCount, setOverrideCount] = useState(0);
  const [pendingCompletionCount, setPendingCompletionCount] = useState(0);
  const [myPassesCount, setMyPassesCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [arrivalsCount, setArrivalsCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => setMounted(true), []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (role !== "INITIATOR" && role !== "SERVICE_ADVISOR") return;
    fetch("/api/gate-pass?status=DRAFT&limit=1")
      .then(r => r.json())
      .then(d => setDraftCount(d.total ?? 0))
      .catch(() => {});
    const id = setInterval(() => {
      fetch("/api/gate-pass?status=DRAFT&limit=1")
        .then(r => r.json())
        .then(d => setDraftCount(d.total ?? 0))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [role]);

  useEffect(() => {
    if (role !== "APPROVER") return;
    const fetchOverrides = () => {
      fetch("/api/gate-pass?status=CASHIER_REVIEW&cashierOverride=true&limit=1")
        .then(r => r.json())
        .then(d => setOverrideCount(d.total ?? 0))
        .catch(() => {});
    };
    fetchOverrides();
    const id = setInterval(fetchOverrides, 60_000);
    return () => clearInterval(id);
  }, [role]);

  useEffect(() => {
    if (role !== "SECURITY_OFFICER") return;
    const fetchPendingCompletion = () => {
      fetch("/api/gate-pass?status=DRAFT&limit=1")
        .then(r => r.json())
        .then(d => setPendingCompletionCount(d.total ?? 0))
        .catch(() => {});
    };
    fetchPendingCompletion();
    const id = setInterval(fetchPendingCompletion, 60_000);
    return () => clearInterval(id);
  }, [role]);

  useEffect(() => {
    const rolesWithCounts = ["INITIATOR", "AREA_SALES_OFFICER", "APPROVER", "DELIVERY_COORDINATOR", "SERVICE_ADVISOR", "CASHIER"];
    if (!role || !rolesWithCounts.includes(role)) return;
    const fetchCounts = () => {
      fetch("/api/sidebar-counts")
        .then(r => r.json())
        .then(d => {
          setMyPassesCount(d.myPasses ?? 0);
          setPendingCount(d.pending ?? 0);
          setRejectedCount(d.rejected ?? 0);
          setCompletedCount(d.completed ?? 0);
        })
        .catch(() => {});
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 60_000);
    return () => clearInterval(id);
  }, [role]);

  // Vehicle Arrivals count — fetched client-side so browser session cookies are carried automatically.
  // Server-side internal fetch fails auth (Next.js App Router cookies() context is not forwarded).
  // Replicates the exact same API calls the receive page makes so the count always matches.
  useEffect(() => {
    if (role !== "INITIATOR" && role !== "SERVICE_ADVISOR") return;
    const fetchArrivals = async () => {
      // Get user location for toLocationCode filtering (matches receive page client-side filter)
      const meRes = await fetch("/api/me").catch(() => null);
      const meData = meRes?.ok ? await meRes.json() : {};
      const userLocation: string | null = meData.user?.defaultLocation ?? null;
      const myCode = userLocation ? userLocation.split(" - ").slice(1).join(" - ").trim() : null;

      const ltParams = new URLSearchParams({ passType: "LOCATION_TRANSFER", status: "GATE_OUT", limit: "1", locationView: "true" });
      const asParams = new URLSearchParams({ passType: "AFTER_SALES", passSubType: "SUB_OUT", status: "GATE_OUT", limit: "1", locationView: "true" });
      if (myCode) {
        ltParams.set("toLocationCode", myCode);
        asParams.set("toLocationCode", myCode);
      }
      const ltRes = await fetch(`/api/gate-pass?${ltParams}`).catch(() => null);
      const ltData = ltRes?.ok ? await ltRes.json() : { total: 0 };
      const asRes = await fetch(`/api/gate-pass?${asParams}`).catch(() => null);
      const asData = asRes?.ok ? await asRes.json() : { total: 0 };
      setArrivalsCount((ltData.total ?? 0) + (asData.total ?? 0));
    };
    void fetchArrivals();
    const id = setInterval(() => void fetchArrivals(), 60_000);
    return () => clearInterval(id);
  }, [role]);

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
    <>
      {/* Hamburger toggle — mobile only */}
      <button
        className="md:hidden fixed top-3 left-3 z-[60] w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: "#0d1b3e", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
        onClick={() => setMobileOpen(o => !o)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? (
          <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Overlay — mobile only, closes sidebar on tap */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-64 flex flex-col z-50 transition-transform duration-300 ease-in-out md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
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
                <span className="relative z-10 truncate flex-1">{item.label}</span>
                {item.showDraftBadge && draftCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#f59e0b", textShadow: "0 0 8px rgba(245,158,11,0.55)" }}>
                    {draftCount}
                  </span>
                )}
                {item.showOverrideBadge && overrideCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#ef4444", textShadow: "0 0 8px rgba(239,68,68,0.55)" }}>
                    {overrideCount}
                  </span>
                )}
                {item.showPendingCompletionBadge && pendingCompletionCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#f59e0b", textShadow: "0 0 8px rgba(245,158,11,0.55)" }}>
                    {pendingCompletionCount}
                  </span>
                )}
                {item.showMyPassesBadge && myPassesCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#f59e0b", textShadow: "0 0 8px rgba(245,158,11,0.55)" }}>
                    {myPassesCount > 99 ? "99+" : myPassesCount}
                  </span>
                )}
                {item.showPendingBadge && pendingCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#f59e0b", textShadow: "0 0 8px rgba(245,158,11,0.55)" }}>
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
                {item.showRejectedBadge && rejectedCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#ef4444", textShadow: "0 0 8px rgba(239,68,68,0.55)" }}>
                    {rejectedCount > 99 ? "99+" : rejectedCount}
                  </span>
                )}
                {item.showArrivalsBadge && arrivalsCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#f59e0b", textShadow: "0 0 8px rgba(245,158,11,0.55)" }}>
                    {arrivalsCount > 99 ? "99+" : arrivalsCount}
                  </span>
                )}
                {item.showCompletedBadge && completedCount > 0 && (
                  <span className="relative z-10 ml-auto text-[12px] font-extrabold tabular-nums leading-none"
                    style={{ color: "#f59e0b", textShadow: "0 0 8px rgba(245,158,11,0.55)" }}>
                    {completedCount > 99 ? "99+" : completedCount}
                  </span>
                )}
                {isActive && !item.showDraftBadge && !item.showOverrideBadge && !item.showPendingCompletionBadge && !item.showMyPassesBadge && !item.showPendingBadge && !item.showRejectedBadge && !item.showArrivalsBadge && !item.showCompletedBadge && (
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
            suppressHydrationWarning
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
