"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const roles = [
  { value: "INITIATOR", label: "Gate Initiator", desc: "Creates gate passes" },
  { value: "APPROVER", label: "Approver", desc: "Reviews and approves passes" },
  { value: "RECIPIENT", label: "Recipient", desc: "Acknowledges vehicle receipt" },
];

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "INITIATOR" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: form.role }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/login?registered=true");
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }}>

      {/* Left Panel */}
      <motion.div
        initial={{ x: -80, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="hidden lg:flex w-[42%] flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0f3a7a 0%, #1a4f9e 50%, #2563eb 100%)" }}
      >
        <div className="absolute w-96 h-96 rounded-full opacity-10 bg-white" style={{ top: "-80px", right: "-80px" }} />
        <div className="absolute w-64 h-64 rounded-full opacity-10 bg-white" style={{ bottom: "-40px", left: "-40px" }} />
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="relative z-10 flex flex-col items-center text-center px-12"
        >
          <div className="w-56 h-24 relative mb-8 rounded-2xl overflow-hidden shadow-2xl">
            <Image src="/logo-dark.jpg" alt="DIMO" fill className="object-cover" priority />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Join DIMO</h1>
          <p className="text-blue-200 text-sm leading-relaxed max-w-xs">
            Create your account to start managing gate passes with role-based access and real-time tracking.
          </p>

          <div className="mt-10 w-full space-y-3">
            {roles.map((r) => (
              <div key={r.value} className="flex items-center gap-3 p-3 rounded-xl text-left" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white text-xs font-bold">{r.label[0]}</div>
                <div>
                  <p className="text-sm font-semibold text-white">{r.label}</p>
                  <p className="text-xs text-blue-200">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
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

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.45 }}>
            <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--text)" }}>Create account</h1>
            <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>Fill in your details to get started</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Full name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                  placeholder="Kamal Perera"
                  className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Email address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                  placeholder="you@dimo.lk"
                  className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Role</label>
                <select
                  value={form.role}
                  onChange={(e) => update("role", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                  ))}
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    required
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 pr-12 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--text-muted)" }}>
                    <EyeIcon show={showPassword} />
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Confirm password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    required
                    placeholder="Re-enter password"
                    className="w-full px-4 py-3 pr-12 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--text-muted)" }}>
                    <EyeIcon show={showConfirm} />
                  </button>
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg disabled:opacity-70"
                style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Creating account...
                  </span>
                ) : "Create Account"}
              </motion.button>
            </form>

            <p className="text-center text-sm mt-6" style={{ color: "var(--text-muted)" }}>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Sign in
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function EyeIcon({ show }: { show: boolean }) {
  return show ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
