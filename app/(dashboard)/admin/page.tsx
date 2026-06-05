"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const BRANDS = ["Mercedes-Benz", "TATA", "Jeep"];
// Roles that can be assigned multiple brands (comma-separated in brand field)
const MULTI_BRAND_ROLES = ["INITIATOR", "APPROVER"];

function BrandSelector({ value, onChange, multi }: { value: string; onChange: (v: string) => void; multi: boolean }) {
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  const toggle = (b: string) => {
    if (!multi) { onChange(selected[0] === b ? "" : b); return; }
    const next = selected.includes(b) ? selected.filter(s => s !== b) : [...selected, b];
    onChange(next.join(", "));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {BRANDS.map(b => {
        const active = selected.includes(b);
        return (
          <button key={b} type="button" onClick={() => toggle(b)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            style={active
              ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff", border: "none" }
              : { background: "var(--surface2)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
            {active && "✓ "}{b}
          </button>
        );
      })}
    </div>
  );
}

type User = {
  id: string; name: string; email: string; role: string | null;
  isDisabled?: boolean;
  createdAt: string; approverId?: string | null;
  backupApproverId?: string | null;
  defaultLocation?: string | null; brand?: string | null;
  approver?: { id: string; name: string } | null;
  backupApprover?: { id: string; name: string } | null;
};

const ROLES = [
  "INITIATOR", "APPROVER", "ADMIN",
  "CASHIER", "AREA_SALES_OFFICER", "SECURITY_OFFICER", "SERVICE_ADVISOR",
  "DELIVERY_COORDINATOR",
];
const ROLE_LABELS: Record<string, string> = {
  INITIATOR: "Initiator", APPROVER: "Approver",
  ADMIN: "Admin", CASHIER: "Cashier", AREA_SALES_OFFICER: "Area Sales Officer",
  SECURITY_OFFICER: "Security Officer", SERVICE_ADVISOR: "Service Advisor",
  DELIVERY_COORDINATOR: "Delivery Coordinator",
};
const roleColors: Record<string, string> = {
  INITIATOR: "#2563eb", APPROVER: "#7c3aed",
  ADMIN: "#dc2626", CASHIER: "#d97706", AREA_SALES_OFFICER: "#0891b2",
  SECURITY_OFFICER: "#0f766e", SERVICE_ADVISOR: "#ea580c",
  DELIVERY_COORDINATOR: "#0d9488",
};
const roleBg: Record<string, string> = {
  INITIATOR: "#eff6ff", APPROVER: "#f5f3ff",
  ADMIN: "#fef2f2", CASHIER: "#fffbeb", AREA_SALES_OFFICER: "#ecfeff",
  SECURITY_OFFICER: "#f0fdfa", SERVICE_ADVISOR: "#fff7ed",
  DELIVERY_COORDINATOR: "#f0fdfa",
};

// Which attributes each role needs
const ROLE_ATTRS: Record<string, ("location" | "brand" | "approver")[]> = {
  INITIATOR:            ["location", "brand", "approver"],
  SECURITY_OFFICER:     ["location"],
  APPROVER:             ["location", "brand"],
  CASHIER:              ["location", "approver"],
  AREA_SALES_OFFICER:   ["location", "brand"],
  SERVICE_ADVISOR:      ["location", "brand"],
  DELIVERY_COORDINATOR: ["location"],
  ADMIN:                [],
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
  const [backupApproverId, setBackupApproverId] = useState(user.backupApproverId ?? "");
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
    // Validate mandatory fields per role
    if (fields.includes("location") && !location.trim()) { setError("Location is required for this role."); return; }
    if (fields.includes("brand") && !brand.trim()) { setError("Brand is required for this role."); return; }
    if (approverId && backupApproverId && approverId === backupApproverId) { setError("Approver 1 and Approver 2 must be different."); return; }
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
          ...(fields.includes("approver") ? { backupApproverId } : {}),
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
        backupApproverId: fields.includes("approver") ? backupApproverId || null : user.backupApproverId,
        backupApprover: fields.includes("approver")
          ? backupApproverId ? (approvers.find(a => a.id === backupApproverId) ? { id: backupApproverId, name: approvers.find(a => a.id === backupApproverId)!.name } : null) : null
          : user.backupApprover,
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
                value={location} onChange={e => { setLocation(e.target.value); setError(""); }}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: !location.trim() ? "#f87171" : "var(--border)", color: "var(--text)" }}
              >
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {!location.trim() && <p className="text-red-500 text-xs mt-1">Required for this role</p>}
            </div>
          )}

          {fields.includes("brand") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Brand <span className="text-red-500">*</span>
                {MULTI_BRAND_ROLES.includes(role) && (
                  <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(select all that apply)</span>
                )}
              </label>
              <BrandSelector value={brand} onChange={v => { setBrand(v); setError(""); }} multi={MULTI_BRAND_ROLES.includes(role)} />
              {!brand.trim() && <p className="text-red-500 text-xs mt-1">Required for this role</p>}
            </div>
          )}

          {fields.includes("approver") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                {role === "CASHIER" ? "Payment Override Approver" : "Approver"}{" "}
                <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <select
                value={approverId} onChange={e => setApproverId(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="">{approvers.length === 0 ? "No approvers yet" : "None"}</option>
                {approvers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {role === "CASHIER" && (
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  This approver will receive payment override requests when the cashier cannot clear a payment.
                </p>
              )}
            </div>
          )}
          {fields.includes("approver") && role !== "CASHIER" && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Approver 2 <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <select
                value={backupApproverId} onChange={e => setBackupApproverId(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="">No Approver 2 assigned</option>
                {approvers.filter(a => a.id !== approverId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Initiators can select this approver if Approver 1 is unavailable.
              </p>
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
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "", approverId: "", backupApproverId: "", defaultLocation: "", brand: "" });
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
    if (fields.includes("location") && !form.defaultLocation.trim()) {
      setError(`Location is required for ${ROLE_LABELS[selectedRole] || selectedRole}.`); return;
    }
    if (fields.includes("brand") && !form.brand.trim()) {
      setError(`Brand is required for ${ROLE_LABELS[selectedRole] || selectedRole}.`); return;
    }
    if (form.approverId && form.backupApproverId && form.approverId === form.backupApproverId) {
      setError("Approver 1 and Approver 2 must be different."); return;
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
      if (data.id && (form.defaultLocation || form.brand || form.approverId || form.backupApproverId)) {
        await fetch("/api/admin/assign-attributes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.id,
            defaultLocation: form.defaultLocation || null,
            brand: form.brand || null,
            approverId: form.approverId || null,
            backupApproverId: form.backupApproverId || null,
          }),
        });
      }
      onCreated({
        ...data,
        defaultLocation: form.defaultLocation || null,
        brand: form.brand || null,
        approverId: form.approverId || null,
        approver: form.approverId
          ? (approvers.find(a => a.id === form.approverId) ?? null)
          : null,
        backupApproverId: form.backupApproverId || null,
        backupApprover: form.backupApproverId
          ? (approvers.find(a => a.id === form.backupApproverId) ?? null)
          : null,
      });
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
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Location <span className="text-red-500">*</span>
              </label>
              <select value={form.defaultLocation} onChange={e => set("defaultLocation", e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: !form.defaultLocation.trim() ? "#f87171" : "var(--border)", color: "var(--text)" }}>
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {!form.defaultLocation.trim() && <p className="text-red-500 text-xs mt-1">Required for {ROLE_LABELS[selectedRole] || selectedRole}</p>}
            </div>
          )}
          {fields.includes("brand") && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Brand <span className="text-red-500">*</span>
                {MULTI_BRAND_ROLES.includes(selectedRole) && (
                  <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(select all that apply)</span>
                )}
              </label>
              <BrandSelector value={form.brand} onChange={v => set("brand", v)} multi={MULTI_BRAND_ROLES.includes(selectedRole)} />
              {!form.brand.trim() && <p className="text-red-500 text-xs mt-1">Required for {ROLE_LABELS[selectedRole] || selectedRole}</p>}
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
          {fields.includes("approver") && approvers.length > 0 && selectedRole !== "CASHIER" && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                Approver 2 <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <select value={form.backupApproverId} onChange={e => set("backupApproverId", e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                <option value="">No Approver 2 assigned</option>
                {approvers.filter(a => a.id !== form.approverId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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

/* ─── Admin Page ──────────────────────────────────────────────────── */
export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [successId, setSuccessId] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [attrModal, setAttrModal] = useState<User | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggleDisabled(userId: string) {
    setTogglingId(userId);
    const res = await fetch("/api/admin/toggle-user", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isDisabled: data.isDisabled } : u));
    } else {
      setActionError(data.error || "Failed to update user status.");
      setTimeout(() => setActionError(null), 4000);
    }
    setTogglingId(null);
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.replace("/");
  }, [status, session, router]);

  const loadUsers = () => {
    setLoading(true);
    setLoadError(null);
    fetch("/api/admin/users")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Unable to load users right now.");
        return d;
      })
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setLoadError("Unable to load users right now. Please try again."); setLoading(false); });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { loadUsers(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const approvers = users.filter(u => u.role === "APPROVER");

  async function assignRole(userId: string, role: string) {
    setAssigning(userId);
    const res = await fetch("/api/admin/assign-role", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      setAssigning(null);
      const errData = await res.json().catch(() => ({}));
      setActionError(errData.error || "Unable to assign the role right now. Please try again.");
      setTimeout(() => setActionError(null), 4000);
      return;
    }
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
    const matchFilter = filter === "ALL" ? !!u.role : filter === "PENDING" ? !u.role : u.role === filter;
    return matchSearch && matchFilter;
  });

  const stats = [
    { label: "Total Users",      value: users.filter(u => !!u.role).length,                        color: "#6366f1", bg: "#eef2ff" },
    { label: "Initiators",       value: users.filter(u => u.role === "INITIATOR").length,           color: "#2563eb", bg: "#eff6ff" },
    { label: "Approvers",        value: users.filter(u => u.role === "APPROVER").length,            color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Admins",           value: users.filter(u => u.role === "ADMIN").length,               color: "#dc2626", bg: "#fef2f2" },
    { label: "Cashiers",         value: users.filter(u => u.role === "CASHIER").length,             color: "#b45309", bg: "#fffbeb" },
    { label: "Area Sales",       value: users.filter(u => u.role === "AREA_SALES_OFFICER").length,  color: "#15803d", bg: "#f0fdf4" },
    { label: "Security",         value: users.filter(u => u.role === "SECURITY_OFFICER").length,    color: "#0f766e", bg: "#f0fdfa" },
    { label: "Service Advisors", value: users.filter(u => u.role === "SERVICE_ADVISOR").length,     color: "#ea580c", bg: "#fff7ed" },
    { label: "DC",              value: users.filter(u => u.role === "DELIVERY_COORDINATOR").length, color: "#0d9488", bg: "#f0fdfa" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>

      {/* Action error toast — role/toggle failures; does NOT hide the user table */}
      <AnimatePresence>
        {actionError && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold"
            style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-2 hover:opacity-70">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddUser && (
          <AddUserModal onClose={() => setShowAddUser(false)} onCreated={(u) => setUsers(prev => [u, ...prev])} approvers={approvers} />
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

      {/* Pending Users — separate section */}
      {users.filter(u => !u.role).length > 0 && (
        <div className="rounded-2xl border mb-5 overflow-hidden" style={{ background: "var(--surface)", borderColor: "#fde68a" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: "#fef3c7", borderBottom: "1px solid #fde68a" }}>
            <div className="flex items-center gap-2">
              <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm font-semibold" style={{ color: "#92400e" }}>
                Pending Role Assignment — {users.filter(u => !u.role).length} user{users.filter(u => !u.role).length !== 1 ? "s" : ""} waiting
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                  {["User", "Joined", "Assign Role"].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.filter(u => !u.role).map((user, i) => (
                  <motion.tr key={user.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    className="group transition-colors" style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: "#94a3b8" }}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold" style={{ color: "var(--text)" }}>{user.name}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        className="border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-300"
                        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                        defaultValue=""
                        onChange={async (e) => {
                          const newRole = e.target.value;
                          if (!newRole) return;
                          await assignRole(user.id, newRole);
                        }}
                      >
                        <option value="">Assign role…</option>
                        {Object.entries(ROLE_LABELS).map(([val, lbl]) => (
                          <option key={val} value={val}>{lbl}</option>
                        ))}
                      </select>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-0">
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
                  {["User", "Current Role", "Location & Brand", "Joined", "Assign Role", "Status"].map(h => (
                    <th key={h} className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadError ? (
                  <tr><td colSpan={5} className="text-center py-16">
                    <p style={{ color: "#ef4444", marginBottom: "0.75rem" }}>Failed to load users: {loadError}</p>
                    <button onClick={loadUsers} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#2563eb" }}>Retry</button>
                  </td></tr>
                ) : loading ? (
                  <tr><td colSpan={5} className="text-center py-16" style={{ color: "var(--text-muted)" }}>Loading users…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-16" style={{ color: "var(--text-muted)" }}>No users found</td></tr>
                ) : filtered.map((user, i) => (
                  <motion.tr key={user.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    className="group transition-colors" style={{ borderBottom: "1px solid var(--border)", opacity: user.isDisabled ? 0.6 : 1 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* User */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ background: user.isDisabled ? "#94a3b8" : (user.role ? (roleColors[user.role] || "#94a3b8") : "#94a3b8") }}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold" style={{ color: "var(--text)" }}>{user.name}</p>
                            {user.isDisabled && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "#fee2e2", color: "#991b1b" }}>Disabled</span>
                            )}
                          </div>
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
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {user.brand.split(",").map(b => b.trim()).filter(Boolean).map(b => (
                                    <span key={b} className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                                      {b}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs" style={{ color: "#f59e0b" }}>⚠ No brand</p>
                              )
                            )}
                            {ROLE_ATTRS[user.role].includes("approver") && user.approver && (
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Approver 1: {user.approver.name}</p>
                            )}
                            {ROLE_ATTRS[user.role].includes("approver") && user.backupApprover && (
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Approver 2: {user.backupApprover.name}</p>
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

                    {/* Disable / Enable toggle */}
                    <td className="px-5 py-4">
                      {user.id === session?.user?.id ? (
                        <span className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--surface2)" }}>
                          Own account
                        </span>
                      ) : (
                        <button
                          onClick={() => void toggleDisabled(user.id)}
                          disabled={togglingId === user.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                          style={user.isDisabled
                            ? { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }
                            : { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
                          {togglingId === user.id ? (
                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                          ) : user.isDisabled ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          )}
                          {user.isDisabled ? "Enable" : "Disable"}
                        </button>
                      )}
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
