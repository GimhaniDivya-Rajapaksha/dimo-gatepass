"use client";
import { useSession, signOut } from "next-auth/react";
import { motion } from "framer-motion";
import Image from "next/image";

export default function PendingPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-lg text-center">

        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="flex justify-center mb-10">
          <div className="w-44 h-16 relative">
            <Image src="/logo-light.png" alt="DIMO" fill className="object-contain" />
          </div>
        </motion.div>

        {/* Animated hourglass card */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }}
          className="rounded-3xl border p-10 shadow-xl" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>

          {/* Animated icon */}
          <div className="relative flex justify-center mb-8">
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}>
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </motion.div>
            {/* Orbiting dots */}
            {[0, 1, 2].map((i) => (
              <motion.div key={i}
                animate={{ rotate: 360 }}
                transition={{ duration: 3 + i, repeat: Infinity, ease: "linear", delay: i * 0.4 }}
                className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none" }}>
                <div className="absolute w-3 h-3 rounded-full"
                  style={{
                    background: i === 0 ? "#2563eb" : i === 1 ? "#60a5fa" : "#93c5fd",
                    top: i === 0 ? "-6px" : i === 1 ? "auto" : "50%",
                    left: i === 0 ? "50%" : i === 1 ? "-6px" : "auto",
                    right: i === 2 ? "-6px" : "auto",
                    transform: "translateX(-50%)",
                    opacity: 0.8,
                  }} />
              </motion.div>
            ))}
          </div>

          <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="text-2xl font-bold mb-3" style={{ color: "var(--text)" }}>
            Account Pending Activation
          </motion.h1>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="text-sm leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>
            Welcome, <strong style={{ color: "var(--text)" }}>{session?.user?.name}</strong>!
            Your account has been created successfully.
          </motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-muted)" }}>
            An <strong style={{ color: "var(--accent)" }}>administrator</strong> will review your account and
            assign your role shortly. Please check back later.
          </motion.p>

          {/* Status steps */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
            className="flex items-center justify-center gap-4 mb-8">
            {[
              { label: "Account Created", done: true },
              { label: "Role Pending", active: true },
              { label: "Access Granted", done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px" style={{ background: "var(--border)" }} />}
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: step.done ? "#10b981" : step.active ? "linear-gradient(135deg,#1a4f9e,#2563eb)" : "var(--surface2)",
                      color: step.done || step.active ? "white" : "var(--text-muted)",
                    }}>
                    {step.done ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <span className="text-xs whitespace-nowrap" style={{ color: step.active ? "var(--accent)" : "var(--text-muted)" }}>
                    {step.label}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Pulsing dots */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-2 mb-8">
            {[0, 1, 2].map((i) => (
              <motion.div key={i}
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--accent)" }} />
            ))}
          </motion.div>

          <motion.button onClick={() => signOut({ callbackUrl: "/login" })}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="px-8 py-3 rounded-xl text-sm font-semibold border transition-all"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface2)" }}>
            Sign Out
          </motion.button>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          className="text-xs mt-6" style={{ color: "var(--text-muted)" }}>
          Need help? Contact your system administrator.
        </motion.p>
      </div>
    </div>
  );
}
