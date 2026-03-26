"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const BRANDS = ["Mercedes-Benz", "TATA", "Jeep"];

type User = {
  id: string; name: string; email: string; role: string | null;
  createdAt: string; approverId?: string | null;
  defaultLocation?: string | null; brand?: string | null;
  approver?: { id: string; name: string } | null;
};

const ROLES = [
  "INITIATOR", "APPROVER", "RECIPIENT", "ADMIN",
  "CASHIER", "AREA_SALES_OFFICER", "SECURITY_OFFICER",
];
const ROLE_LABELS: Record<string, string> = {
  INITIATOR: "Initiator", APPROVER: "Approver", RECIPIENT: "Recipient",
  ADMIN: "Admin", CASHIER: "Cashier", AREA_SALES_OFFICER: "Area Sales Officer",
  SECURITY_OFFICER: "Security Officer",
};
const roleColors: Record<string, string> = {
  INITIATOR: "#2563eb", APPROVER: "#7c3aed", RECIPIENT: "#059669",
  ADMIN: "#dc2626", CASHIER: "#d97706", AREA_SALES_OFFICER: "#0891b2",
  SECURITY_OFFICER: "#0f766e",
};
const roleBg: Record<string, string> = {
  INITIATOR: "#eff6ff", APPROVER: "#f5f3ff", RECIPIENT: "#ecfdf5",
  ADMIN: "#fef2f2", CASHIER: "#fffbeb", AREA_SALES_OFFICER: "#ecfeff",
  SECURITY_OFFICER: "#f0fdfa",
};

// Which attributes each role needs
const ROLE_ATTRS: Record<string, ("location" | "brand" | "approver")[]> = {
  INITIATOR:          ["location", "brand", "approver"],
  SECURITY_OFFICER:   ["location"],
  APPROVER:           ["location", "brand"],
  CASHIER:            ["location"],
  AREA_SALES_OFFICER: ["location", "brand"],
  RECIPIENT:          ["location", "brand"],
  ADMIN:              [],
};

/* ─── Assign Attributes Modal ─────────────────────────────────────── */
function AssignAttributesModal({
  user, approvers, onClose, onSaved,
}: {
  user: User;
  approvers: User[];
  onClose: () => void;
  onSaved: (updated: Partial<User>) => void;
}) {
  const role = user.role ?? "";
  const fields = ROLE_ATTRS[role] ?? [];
  const [location, setLocation] = useState(user.defaultLocation ?? "");
  const [brand, setBrand] = useState(user.brand ?? "");
  const [approverId, setApproverId] = useState(user.approverId ?? "");
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/locations")
      .then(r => r.json())
      .then(d => setLocations(d.locations ?? []))
      .catch(() => {});
  }, []);

  if (fields.length === 0) return null;

  const handleSave = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/assign-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          ...(fields.includes("location") ? { defaultLocation: location } : {}),
          ...(fields.includes("brand") ? { brand } : {}),
          ...(fields.includes("approver") ? { approverId } : {}),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed"); setLoading(false); return; }
      onSaved({
        defaultLocation: fields.includes("location") ? location || null : user.defaultLocation,
        brand: fields.includes("brand") ? brand || null : user.brand,
        approverId: fields.includes("approver") ? approverId || null : user.approverId,
        approver: fields.includes("approver")
          ? approverId ? (approvers.find(a => a.id === approverId) ? { id: approverId, name: approvers.find(a => a.id === approverId)!.name } : null) : null
          : user.approver,
      });
      onClose();
    } catch {
      setError("Failed. Try again.");
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
            <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Assign Details</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {user.name} · <span className="font-semibold" style={{ color: roleColors[role] || "var(--text)" }}>{ROLE_LABELS[role] || role}</span>
            </p>
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

        <div className="space-y-4">
          {fields.includes("location") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Location <span className="text-red-500">*</span>
              </label>
              <select
                value={location} onChange={e => setLocation(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}

          {fields.includes("brand") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Brand <span className="text-red-500">*</span>
              </label>
              <select
                value={brand} onChange={e => setBrand(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="">— Select brand —</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}

          {fields.includes("approver") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Approver <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <select
                value={approverId} onChange={e => setApproverId(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="">{approvers.length === 0 ? "No approvers yet" : "None"}</option>
                {approvers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
            <span className="font-semibold" style={{ color: "var(--text)" }}>{ROLE_LABELS[role]} requires: </span>
            {fields.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(" + ")}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
              style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface2)" }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-70 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}>
              {loading && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Add User Modal ──────────────────────────────────────────────── */
function AddUserModal({ onClose, onCreated, approvers }: {
  onClose: () => void;
  onCreated: (u: User) => void;
  approvers: User[];
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "", approverId: "", defaultLocation: "", brand: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/admin/locations")
      .then(r => r.json())
      .then(d => setLocations(d.locations ?? []))
      .catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const selectedRole = form.role;
  const fields = ROLE_ATTRS[selectedRole] ?? [];

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
      // Also save attributes if provided
      if (data.id && (form.defaultLocation || form.brand || form.approverId)) {
        await fetch("/api/admin/assign-attributes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.id,
            defaultLocation: form.defaultLocation || null,
            brand: form.brand || null,
            approverId: form.approverId || null,
          }),
        });
      }
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
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto"
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
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Full Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Malmi Perera"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Email Address <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="e.g. malmi@dimo.lk"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Password <span className="text-red-500">*</span></label>
            <input type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="Min. 6 characters"
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
              Role <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional — can assign later)</span>
            </label>
            <select value={form.role} onChange={e => set("role", e.target.value)}
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="">No role (Pending)</option>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>

          {fields.includes("location") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Location</label>
              <select value={form.defaultLocation} onChange={e => set("defaultLocation", e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          {fields.includes("brand") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Brand</label>
              <select value={form.brand} onChange={e => set("brand", e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                <option value="">— Select brand —</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          {fields.includes("approver") && approvers.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Approver <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <select value={form.approverId} onChange={e => set("approverId", e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                <option value="">No approver assigned</option>
                {approvers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
              style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface2)" }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-70 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}>
              {loading && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
              {loading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ─── Bulk Upload Modal ───────────────────────────────────────────── */
function BulkUploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [parsed, setParsed] = useState<{ name: string; email: string; password: string; role: string; approverEmail: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ name: string; status: string; error?: string }[]>([]);

  const downloadTemplate = () => {
    const csv = "name,email,password,role,approverEmail\nMalmi Perera,malmi@dimo.lk,password123,INITIATOR,approver@dimo.lk\nKamal Silva,kamal@dimo.lk,password123,APPROVER,";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "user-upload-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setError("No data rows found"); return; }
      const rows = lines.slice(1).map(line => {
        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        return { name: cols[0] ?? "", email: cols[1] ?? "", password: cols[2] ?? "", role: cols[3] ?? "", approverEmail: cols[4] ?? "" };
      }).filter(r => r.email);
      if (rows.length === 0) { setError("No valid rows found"); return; }
      setParsed(rows); setError("");
    };
    reader.readAsText(f);
  };

  const handleUpload = async () => {
    if (parsed.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bulk-upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: parsed }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setError("Upload failed. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Bulk Upload Users</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {results.length === 0 ? (
          <>
            <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>CSV Columns (header row required):</p>
              <code className="font-mono">name, email, password, role, approverEmail</code><br />
              <code className="font-mono opacity-70 text-[10px]">Roles: {ROLES.join(" | ")}</code>
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm mb-4 hover:underline" style={{ color: "var(--accent)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download Template CSV
            </button>
            <label className="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors hover:border-blue-400" style={{ borderColor: "var(--border)" }}>
              <svg className="w-8 h-8" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Click to upload CSV</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Only .csv files are supported</p>
              <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            {parsed.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>{parsed.length} user{parsed.length !== 1 ? "s" : ""} ready to upload</p>
                <div className="max-h-40 overflow-auto rounded-xl border text-xs" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full">
                    <thead><tr style={{ background: "var(--surface2)" }}>{["Name", "Email", "Role"].map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>)}</tr></thead>
                    <tbody>{parsed.map((r, i) => <tr key={i} style={{ borderTop: "1px solid var(--border)" }}><td className="px-3 py-1.5" style={{ color: "var(--text)" }}>{r.name || "—"}</td><td className="px-3 py-1.5" style={{ color: "var(--text-muted)" }}>{r.email}</td><td className="px-3 py-1.5" style={{ color: "var(--text-muted)" }}>{r.role || "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: "var(--text)", borderColor: "var(--border)", background: "var(--surface2)" }}>Cancel</button>
              <button onClick={handleUpload} disabled={parsed.length === 0 || loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}>
                {loading && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
                {loading ? "Uploading..." : parsed.length > 0 ? `Upload ${parsed.length} User${parsed.length !== 1 ? "s" : ""}` : "Upload"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Upload Results</p>
            <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "var(--surface2)" }}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === "created" ? "bg-green-500" : r.status === "skipped" ? "bg-amber-400" : "bg-red-500"}`} />
                  <span className="text-sm flex-1" style={{ color: "var(--text)" }}>{r.name}</span>
                  <span className="text-xs" style={{ color: r.status === "created" ? "#059669" : r.status === "skipped" ? "#92400e" : "#dc2626" }}>
                    {r.status === "created" ? "Created" : r.status === "skipped" ? `Skipped: ${r.error}` : "Error"}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => { onDone(); onClose(); }} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}>Done</button>
          </>
        )}
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
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [attrModal, setAttrModal] = useState<User | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.replace("/");
  }, [status, session, router]);

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then(r => r.ok ? r.json() : [])
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const approvers = users.filter(u => u.role === "APPROVER");

  async function assignRole(userId: string, role: string) {
    setAssigning(userId);
    await fetch("/api/admin/assign-role", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    setAssigning(null);
    setSuccessId(userId);
    setTimeout(() => setSuccessId(null), 2000);
    // Open attributes modal if this role needs extra fields
    if ((ROLE_ATTRS[role] ?? []).length > 0) {
      const user = users.find(u => u.id === userId);
      if (user) setAttrModal({ ...user, role });
    }
  }

  if (status === "loading") return null;

  const FILTER_TABS = ["ALL", "PENDING", ...ROLES];

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "ALL" ? true : filter === "PENDING" ? !u.role : u.role === filter;
    return matchSearch && matchFilter;
  });

  const stats = [
    { label: "Total Users",   value: users.length,                                   color: "#6366f1", bg: "#eef2ff" },
    { label: "Pending",       value: users.filter(u => !u.role).length,               color: "#f59e0b", bg: "#fef3c7" },
    { label: "Initiators",    value: users.filter(u => u.role === "INITIATOR").length, color: "#2563eb", bg: "#eff6ff" },
    { label: "Approvers",     value: users.filter(u => u.role === "APPROVER").length,  color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Security",      value: users.filter(u => u.role === "SECURITY_OFFICER").length, color: "#0f766e", bg: "#f0fdfa" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <AnimatePresence>
        {showAddUser && (
          <AddUserModal onClose={() => setShowAddUser(false)} onCreated={(u) => setUsers(prev => [u, ...prev])} approvers={approvers} />
        )}
        {showBulkUpload && (
          <BulkUploadModal onClose={() => setShowBulkUpload(false)} onDone={loadUsers} />
        )}
        {attrModal && (ROLE_ATTRS[attrModal.role ?? ""] ?? []).length > 0 && (
          <AssignAttributesModal
            user={attrModal}
            approvers={approvers}
            onClose={() => setAttrModal(null)}
            onSaved={(updated) => {
              setUsers(prev => prev.map(u => u.id === attrModal.id ? { ...u, ...updated } : u));
              setAttrModal(null);
            }}
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
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {users.filter(u => !u.role).length > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
              <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-2 h-2 rounded-full bg-amber-500" />
              {users.filter(u => !u.role).length} pending
            </motion.div>
          )}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setShowBulkUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Bulk Upload
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setShowAddUser(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md"
            style={{ background: "linear-gradient(135deg, #1a4f9e, #2563eb)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Add User
          </motion.button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-2xl border p-4 relative overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
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
          {FILTER_TABS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
              style={filter === f
                ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff", border: "none" }
                : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
              {f === "ALL" ? "All" : f === "PENDING" ? "Pending" : ROLE_LABELS[f] || f}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                  {["User", "Current Role", "Location & Brand", "Joined", "Assign Role"].map(h => (
                    <th key={h} className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-16" style={{ color: "var(--text-muted)" }}>No users found</td></tr>
                ) : filtered.map((user, i) => (
                  <motion.tr key={user.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    className="group transition-colors" style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* User */}
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

                    {/* Role badge */}
                    <td className="px-5 py-4">
                      <AnimatePresence mode="wait">
                        {successId === user.id ? (
                          <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                            style={{ background: "#ecfdf5", color: "#059669" }}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            Updated!
                          </motion.span>
                        ) : user.role ? (
                          <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold"
                            style={{ background: roleBg[user.role] || "#f1f5f9", color: roleColors[user.role] || "#64748b" }}>
                            {ROLE_LABELS[user.role] || user.role}
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

                    {/* Location & Brand */}
                    <td className="px-5 py-4">
                      {user.role && (ROLE_ATTRS[user.role] ?? []).length > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            {user.defaultLocation ? (
                              <p className="text-xs font-medium truncate max-w-[140px]" style={{ color: "var(--text)" }} title={user.defaultLocation}>
                                📍 {user.defaultLocation}
                              </p>
                            ) : (
                              <p className="text-xs" style={{ color: "#f59e0b" }}>⚠ No location</p>
                            )}
                            {ROLE_ATTRS[user.role].includes("brand") && (
                              user.brand ? (
                                <p className="text-xs truncate max-w-[140px]" style={{ color: "var(--text-muted)" }} title={user.brand}>
                                  🏷 {user.brand}
                                </p>
                              ) : (
                                <p className="text-xs" style={{ color: "#f59e0b" }}>⚠ No brand</p>
                              )
                            )}
                            {ROLE_ATTRS[user.role].includes("approver") && user.approver && (
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>👤 {user.approver.name}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setAttrModal(user)}
                            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border hover:opacity-80 transition-opacity"
                            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                            title="Edit location / brand / approver"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>

                    {/* Assign Role dropdown */}
                    <td className="px-5 py-4">
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) assignRole(user.id, e.target.value); e.target.value = ""; }}
                        disabled={assigning === user.id}
                        className="px-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer disabled:opacity-50 transition-all"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                        <option value="" disabled>{assigning === user.id ? "Updating..." : "Assign role..."}</option>
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
