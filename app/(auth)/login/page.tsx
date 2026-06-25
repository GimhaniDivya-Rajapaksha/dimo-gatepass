"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";

const FLOATING_ICONS = [
  { icon: "🚗", x: 15, y: 20, delay: 0, size: 28 },
  { icon: "📋", x: 72, y: 15, delay: 0.5, size: 24 },
  { icon: "✅", x: 82, y: 60, delay: 1, size: 22 },
  { icon: "🔔", x: 10, y: 75, delay: 1.5, size: 20 },
  { icon: "🏢", x: 55, y: 80, delay: 0.8, size: 26 },
  { icon: "🔑", x: 35, y: 10, delay: 1.2, size: 20 },
];

const STAT_ICONS = [
  { label: "Gate Passes", icon: "📋" },
  { label: "Vehicles Tracked", icon: "🚗" },
  { label: "Users", icon: "👥" },
];

function MicrosoftLoginForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const authError = searchParams.get("error");
  const externalError =
    authError === "AccountNotProvisioned"
      ? "Your Azure AD account is valid, but this email is not assigned in the Gate Pass system yet."
      : authError === "NoAzureEmail"
        ? "Azure AD did not return an email address for this account."
        : authError === "AccountProvisioningFailed"
          ? "Microsoft sign-in succeeded, but we could not create your local Gate Pass account."
          : authError === "OAuthCallback"
            ? "Microsoft sign-in callback failed. Check Azure redirect URI, tenant/client values, and client secret."
            : authError === "AccessDenied"
              ? "Sign-in was denied for this account."
              : authError === "AccountDisabled"
                ? "Your account has been disabled. Please contact your administrator."
                : "";

  async function handleMicrosoftSignIn() {
    setLoading(true);
    setError("");
    await signIn("azure-ad", { callbackUrl: "/" });
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.25, duration: 0.45 }}
      className="flex flex-col items-center text-center"
    >
      <div className="mb-2 flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg" style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}>
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      <h1 className="text-3xl font-bold mt-4 mb-2" style={{ color: "var(--text)" }}>Welcome back</h1>
      <p className="text-sm mb-8 max-w-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Please sign in using your DIMO Microsoft account to access the Gate Pass system.
      </p>

      {(error || externalError) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl mb-6 text-left"
        >
          {error || externalError}
        </motion.div>
      )}

      <motion.button
        type="button"
        onClick={handleMicrosoftSignIn}
        disabled={loading}
        whileHover={{ scale: loading ? 1 : 1.02 }}
        whileTap={{ scale: loading ? 1 : 0.98 }}
        className="w-full py-4 rounded-2xl font-semibold text-base border transition-all disabled:opacity-70 flex items-center justify-center gap-3 shadow-md"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        suppressHydrationWarning
      >
        {loading ? (
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#f25022" d="M1 1h10v10H1z" />
            <path fill="#00a4ef" d="M13 1h10v10H13z" />
            <path fill="#7fba00" d="M1 13h10v10H1z" />
            <path fill="#ffb900" d="M13 13h10v10H13z" />
          </svg>
        )}
        {loading ? "Signing in..." : "Sign in with Microsoft"}
      </motion.button>

      <p className="text-xs mt-8 leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Use your <span className="font-semibold">@dimo.lk</span> Microsoft account.<br />
        Contact your administrator if you need access.
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  const [stats, setStats] = useState([
    { label: "Gate Passes", value: "...", icon: "📋" },
    { label: "Vehicles Tracked", value: "...", icon: "🚗" },
    { label: "Users", value: "...", icon: "👥" },
  ]);

  useEffect(() => {
    fetch("/api/public-stats")
      .then((r) => r.json())
      .then((d) => {
        setStats([
          { label: "Gate Passes", value: d.gatePasses.toLocaleString(), icon: "📋" },
          { label: "Vehicles Tracked", value: d.vehiclesTracked.toLocaleString(), icon: "🚗" },
          { label: "Users", value: d.users.toLocaleString(), icon: "👥" },
        ]);
      })
      .catch(() => {
        setStats(STAT_ICONS.map((s) => ({ ...s, value: "—" })));
      });
  }, []);

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="hidden lg:flex w-[45%] flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0a2a5e 0%, #1a4f9e 45%, #2563eb 100%)" }}
      >
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.15, 0.08] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute w-[500px] h-[500px] rounded-full bg-white"
          style={{ top: "-180px", right: "-180px" }}
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.06, 0.12, 0.06] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute w-80 h-80 rounded-full bg-white"
          style={{ bottom: "-100px", left: "-80px" }}
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute w-40 h-40 rounded-full bg-white opacity-5"
          style={{ top: "40%", left: "5%" }}
        />

        <div className="absolute inset-0 overflow-hidden opacity-10">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
              className="absolute w-full border-t border-white"
              style={{ top: `${(i + 1) * 16}%` }}
            />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
              className="absolute h-full border-l border-white"
              style={{ left: `${(i + 1) * 20}%` }}
            />
          ))}
        </div>

        {FLOATING_ICONS.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.7, 0.7, 0],
              scale: [0, 1, 1, 0],
              y: [0, -12, -24, -36],
            }}
            transition={{
              duration: 4,
              delay: item.delay + 1,
              repeat: Infinity,
              repeatDelay: 3,
              ease: "easeInOut",
            }}
            className="absolute pointer-events-none"
            style={{ left: `${item.x}%`, top: `${item.y}%`, fontSize: item.size }}
          >
            {item.icon}
          </motion.div>
        ))}

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="relative z-10 flex flex-col items-center text-center px-10"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
            className="w-52 h-20 relative mb-8 rounded-2xl overflow-hidden shadow-2xl"
            style={{ border: "2px solid rgba(255,255,255,0.2)" }}
          >
            <Image src="/logo-dark.jpg" alt="DIMO" fill className="object-cover" priority />
          </motion.div>

          <motion.h1
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-3xl font-bold text-white mb-3"
          >
            Gate Pass System
          </motion.h1>
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-blue-200 text-sm leading-relaxed max-w-xs mb-10"
          >
            Manage vehicle gate passes with full audit trail, role-based approvals, and real-time tracking.
          </motion.p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.8 + i * 0.12 }}
                className="flex items-center justify-between px-5 py-3 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-blue-100 text-sm">{s.label}</span>
                </div>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 + i * 0.12 }}
                  className="text-white font-bold text-sm"
                >
                  {s.value}
                </motion.span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-0 left-0 right-0 h-24"
          style={{ background: "linear-gradient(to top, rgba(255,255,255,0.2), transparent)" }}
        />
      </motion.div>

      <motion.div
        initial={{ x: 80, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex-1 flex items-center justify-center p-8"
      >
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center">
            <div className="w-36 h-14 relative">
              <Image src="/logo-light.png" alt="DIMO" fill className="object-contain" />
            </div>
          </div>

          <Suspense fallback={<div className="text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>}>
            <MicrosoftLoginForm />
          </Suspense>
        </div>
      </motion.div>
    </div>
  );
}
