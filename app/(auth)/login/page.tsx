"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const FLOATING_ICONS = [
  { icon: "🚗", x: 15, y: 20, delay: 0,    size: 28 },
  { icon: "📋", x: 72, y: 15, delay: 0.5,  size: 24 },
  { icon: "✅", x: 82, y: 60, delay: 1,    size: 22 },
  { icon: "🔔", x: 10, y: 75, delay: 1.5,  size: 20 },
  { icon: "🏢", x: 55, y: 80, delay: 0.8,  size: 26 },
  { icon: "🔑", x: 35, y: 10, delay: 1.2,  size: 20 },
];

const STATS = [
  { label: "Gate Passes", value: "2,400+", icon: "📋" },
  { label: "Vehicles Tracked", value: "850+",   icon: "🚗" },
  { label: "Users",            value: "120+",   icon: "👥" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", { email, password, redirect: false });

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const role = session?.user?.role;

    if (role === "ADMIN") router.push("/admin");
    else if (role === "INITIATOR") router.push("/initiator");
    else if (role === "APPROVER") router.push("/approver");
    else if (role === "RECIPIENT") router.push("/recipient");
    else router.push("/");
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>

      {/* Left Panel - animated */}
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="hidden lg:flex w-[45%] flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0a2a5e 0%, #1a4f9e 45%, #2563eb 100%)" }}
      >
        {/* Animated background circles */}
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

        {/* Animated grid lines */}
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

        {/* Floating icons */}
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

        {/* Main content */}
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

          {/* Stat pills */}
          <div className="flex flex-col gap-3 w-full max-w-xs">
            {STATS.map((s, i) => (
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

        {/* Bottom wave decoration */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-0 left-0 right-0 h-24"
          style={{ background: "linear-gradient(to top, rgba(255,255,255,0.2), transparent)" }}
        />
      </motion.div>

      {/* Right Panel */}
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

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25, duration: 0.45 }}>
            <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--text)" }}>Welcome back</h1>
            <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
              Sign in to your DIMO Gate Pass account
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@dimo.lk"
                  className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>

              {/* Password with toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium" style={{ color: "var(--text)" }}>Password</label>
                  <Link href="/forgot-password" className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••••"
                    className="w-full px-4 py-3 pr-12 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg transition-opacity disabled:opacity-70"
                style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Signing in...
                  </span>
                ) : "Sign In"}
              </motion.button>
            </form>

            {/* Sign up link */}
            <p className="text-center text-sm mt-6" style={{ color: "var(--text-muted)" }}>
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Create account
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
