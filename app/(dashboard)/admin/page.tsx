"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type User = { id: string; name: string; email: string; role: string | null; createdAt: string };
const ROLES = ["INITIATOR", "APPROVER", "RECIPIENT", "ADMIN"];
const roleColors: Record<string, string> = { INITIATOR: "#2563eb", APPROVER: "#7c3aed", RECIPIENT: "#059669", ADMIN: "#dc2626" };
const roleBg: Record<string, string> = { INITIATOR: "#eff6ff", APPROVER: "#f5f3ff", RECIPIENT: "#ecfdf5", ADMIN: "#fef2f2" };

/* ─── Add User Modal ──────────────────────────────────────────────── */
function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Name, email and password are required"); return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create user"); setLoading(false); return; }
      onCreated(data);
      onClose();
    } catch {
      setError("Failed to create user. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl mx-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Add New User</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Create a new system account</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-xl text-xs text-red-600 border" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name} onChange={e => set("name", e.target.value)}
              placeholder="e.g. Malmi Perera"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email" value={form.email} onChange={e => set("email", e.target.value)}
              placeholder="e.g. malmi@dimo.lk"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password" value={form.password} onChange={e => set("password", e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
              Role <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional — can assign later)</span>
            </label>
            <select
              value={form.role} onChange={e => set("role", e.target.value)}
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="">No role (Pending)</option>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
              style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface2)" }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-70 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}
            >
              {loading && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ─── Admin Page ──────────────────────────────────────────────────── */
export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [successId, setSuccessId] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.replace("/");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then(r => r.ok ? r.json() : [])
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function assignRole(userId: string, role: string) {
    setAssigning(userId);
    await fetch("/api/admin/assign-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    setAssigning(null);
    setSuccessId(userId);
    setTimeout(() => setSuccessId(null), 2000);
  }

  if (status === "loading") return null;

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "ALL" ? true : filter === "PENDING" ? !u.role : u.role === filter;
    return matchSearch && matchFilter;
  });

  const stats = [
    { label: "Total Users", value: users.length, color: "#6366f1", bg: "#eef2ff" },
    { label: "Pending", value: users.filter(u => !u.role).length, color: "#f59e0b", bg: "#fef3c7" },
    { label: "Initiators", value: users.filter(u => u.role === "INITIATOR").length, color: "#2563eb", bg: "#eff6ff" },
    { label: "Approvers", value: users.filter(u => u.role === "APPROVER").length, color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Recipients", value: users.filter(u => u.role === "RECIPIENT").length, color: "#059669", bg: "#ecfdf5" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AnimatePresence>
        {showAddUser && (
          <AddUserModal
            onClose={() => setShowAddUser(false)}
            onCreated={(u) => setUsers(prev => [u, ...prev])}
          />
        )}
      </AnimatePresence>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
            <span className="font-normal">User</span> Management
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Assign roles and manage system access</p>
        </div>
        <div className="flex items-center gap-3">
          {users.filter(u => !u.role).length > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
              <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-amber-500" />
              {users.filter(u => !u.role).length} pending
            </motion.div>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowAddUser(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md"
            style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </motion.button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-2xl border p-4 relative overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: s.color }} />
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: s.bg }}>
                <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              </div>
            </div>
            <p className="text-3xl font-black" style={{ color: s.color }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-52">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["ALL", "PENDING", "INITIATOR", "APPROVER", "RECIPIENT", "ADMIN"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all"
              style={filter === f
                ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff", border: "none" }
                : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
              {f === "ALL" ? "All" : f === "PENDING" ? "Pending" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* User Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                {["User", "Current Role", "Joined", "Assign Role"].map(h => (
                  <th key={h} className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16" style={{ color: "var(--text-muted)" }}>No users found</td></tr>
              ) : filtered.map((user, i) => (
                <motion.tr key={user.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className="group transition-colors" style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ background: user.role ? (roleColors[user.role] || "#94a3b8") : "#94a3b8" }}>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold" style={{ color: "var(--text)" }}>{user.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <AnimatePresence mode="wait">
                      {successId === user.id ? (
                        <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ background: "#ecfdf5", color: "#059669" }}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Updated!
                        </motion.span>
                      ) : user.role ? (
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ background: roleBg[user.role] || "#f1f5f9", color: roleColors[user.role] || "#64748b" }}>
                          {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                        </span>
                      ) : (
                        <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ background: "#fef3c7", color: "#92400e" }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                          Pending
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </td>
                  <td className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-4">
                    <select
                      defaultValue=""
                      onChange={e => { if (e.target.value) assignRole(user.id, e.target.value); e.target.value = ""; }}
                      disabled={assigning === user.id}
                      className="px-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-50 transition-all"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                      <option value="" disabled>{assigning === user.id ? "Updating..." : "Assign role..."}</option>
                      {ROLES.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
                    </select>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
