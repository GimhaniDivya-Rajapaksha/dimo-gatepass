"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────
type Tab = "carrier" | "driver" | "outReason";

type CarrierRecord = { id: string; companyName: string; registrationNo: string; createdAt: string };
type DriverRecord  = { id: string; name: string; nic: string; contact: string | null; createdAt: string };
type OutReasonRecord = { id: string; value: string; createdAt: string };

type ModalState =
  | { open: false }
  | { open: true; mode: "add" | "edit"; type: "carrier";   data?: CarrierRecord }
  | { open: true; mode: "add" | "edit"; type: "driver";    data?: DriverRecord }
  | { open: true; mode: "add" | "edit"; type: "outReason"; data?: OutReasonRecord };

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function MasterDataPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab]           = useState<Tab>("carrier");
  const [search, setSearch]     = useState("");
  const [carriers, setCarriers] = useState<CarrierRecord[]>([]);
  const [drivers,  setDrivers]  = useState<DriverRecord[]>([]);
  const [reasons,  setReasons]  = useState<OutReasonRecord[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState<ModalState>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  // Form state
  const [formCarrier,   setFormCarrier]   = useState({ companyName: "", registrationNo: "" });
  const [formDriver,    setFormDriver]    = useState({ name: "", nic: "", contact: "" });
  const [formOutReason, setFormOutReason] = useState({ value: "" });

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status === "authenticated" && (session as any)?.user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [status, session, router]);

  const load = useCallback(async (t: Tab, q = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/master-data?type=${t}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (t === "carrier")   setCarriers(json.data ?? []);
      if (t === "driver")    setDrivers(json.data ?? []);
      if (t === "outReason") setReasons(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSearch("");
    load(tab, "");
  }, [tab, load]);

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => load(tab, search), 300);
    return () => clearTimeout(t);
  }, [search, tab, load]);

  function openAdd(t: Tab) {
    setError(""); setSuccess("");
    if (t === "carrier")   setFormCarrier({ companyName: "", registrationNo: "" });
    if (t === "driver")    setFormDriver({ name: "", nic: "", contact: "" });
    if (t === "outReason") setFormOutReason({ value: "" });
    setModal({ open: true, mode: "add", type: t } as ModalState);
  }

  function openEdit(t: Tab, record: CarrierRecord | DriverRecord | OutReasonRecord) {
    setError(""); setSuccess("");
    if (t === "carrier") {
      const r = record as CarrierRecord;
      setFormCarrier({ companyName: r.companyName, registrationNo: r.registrationNo });
      setModal({ open: true, mode: "edit", type: "carrier", data: r });
    } else if (t === "driver") {
      const r = record as DriverRecord;
      setFormDriver({ name: r.name, nic: r.nic, contact: r.contact ?? "" });
      setModal({ open: true, mode: "edit", type: "driver", data: r });
    } else {
      const r = record as OutReasonRecord;
      setFormOutReason({ value: r.value });
      setModal({ open: true, mode: "edit", type: "outReason", data: r });
    }
  }

  async function handleSave() {
    if (!modal.open) return;
    setSaving(true); setError("");
    try {
      let body: Record<string, string> = { type: modal.type };
      if (modal.type === "carrier")   body = { ...body, ...formCarrier };
      if (modal.type === "driver")    body = { ...body, ...formDriver };
      if (modal.type === "outReason") body = { ...body, ...formOutReason };

      const isEdit = modal.mode === "edit";
      if (isEdit && modal.data) body.id = modal.data.id;

      const res = await fetch("/api/admin/master-data", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save"); return; }

      setSuccess(isEdit ? "Updated successfully" : "Added successfully");
      setModal({ open: false });
      load(tab, search);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/admin/master-data?type=${tab}&id=${deleteId}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed to delete"); return; }
      setDeleteId(null);
      setSuccess("Deleted successfully");
      load(tab, search);
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "carrier",   label: "Carrier Details" },
    { id: "driver",    label: "Driver Details"  },
    { id: "outReason", label: "Out Reasons"     },
  ];

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Master Data</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Manage carrier details, driver details, and out reasons used in gate pass forms
        </p>
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
          style={{ background: "#dcfce7", color: "#166534" }}>
          <span>{success}</span>
          <button onClick={() => setSuccess("")} className="ml-4 text-lg leading-none">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "var(--surface2)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t.id
              ? { background: "var(--accent)", color: "#fff" }
              : { color: "var(--text-muted)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <input
            type="text" placeholder={`Search ${tabs.find(t => t.id === tab)?.label ?? ""}…`}
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-64 px-3 py-2 rounded-lg text-sm border outline-none transition-colors"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          <button onClick={() => openAdd(tab)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "var(--accent)", color: "#fff" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add {tabs.find(t => t.id === tab)?.label.replace(" Details", "").replace("Out ", "Out ")}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            {/* Carriers tab */}
            {tab === "carrier" && (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Company Name", "Registration No.", "Added On", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {carriers.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No carriers found</td></tr>
                  ) : carriers.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{r.companyName}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.registrationNo}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <RowActions onEdit={() => openEdit("carrier", r)} onDelete={() => setDeleteId(r.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Drivers tab */}
            {tab === "driver" && (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Driver Name", "NIC / License", "Contact", "Added On", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drivers.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No drivers found</td></tr>
                  ) : drivers.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.nic}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.contact ?? "—"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <RowActions onEdit={() => openEdit("driver", r)} onDelete={() => setDeleteId(r.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Out Reasons tab */}
            {tab === "outReason" && (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Out Reason", "Added On", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reasons.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No out reasons found</td></tr>
                  ) : reasons.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{r.value}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <RowActions onEdit={() => openEdit("outReason", r)} onDelete={() => setDeleteId(r.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6"
            style={{ background: "var(--surface)" }}>
            <h2 className="text-lg font-bold mb-5" style={{ color: "var(--text)" }}>
              {modal.mode === "add" ? "Add" : "Edit"}{" "}
              {modal.type === "carrier" ? "Carrier" : modal.type === "driver" ? "Driver" : "Out Reason"}
            </h2>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: "#fee2e2", color: "#dc2626" }}>{error}</div>
            )}

            {/* Carrier form */}
            {modal.type === "carrier" && (
              <div className="space-y-4">
                <Field label="Company Name *">
                  <input type="text" value={formCarrier.companyName}
                    onChange={e => setFormCarrier(p => ({ ...p, companyName: e.target.value }))}
                    placeholder="e.g. ABC Transport Ltd"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
                <Field label="Registration No. *">
                  <input type="text" value={formCarrier.registrationNo}
                    onChange={e => setFormCarrier(p => ({ ...p, registrationNo: e.target.value }))}
                    placeholder="e.g. WP-AB-1234"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
              </div>
            )}

            {/* Driver form */}
            {modal.type === "driver" && (
              <div className="space-y-4">
                <Field label="Driver Name *">
                  <input type="text" value={formDriver.name}
                    onChange={e => setFormDriver(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Kamal Perera"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
                <Field label="NIC / License No. *">
                  <input type="text" value={formDriver.nic}
                    onChange={e => setFormDriver(p => ({ ...p, nic: e.target.value }))}
                    placeholder="e.g. 901234567V"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
                <Field label="Contact No.">
                  <input type="text" value={formDriver.contact}
                    onChange={e => setFormDriver(p => ({ ...p, contact: e.target.value }))}
                    placeholder="e.g. 0771234567"
                    maxLength={10}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
              </div>
            )}

            {/* Out Reason form */}
            {modal.type === "outReason" && (
              <div className="space-y-4">
                <Field label="Out Reason *">
                  <input type="text" value={formOutReason.value}
                    onChange={e => setFormOutReason({ value: e.target.value })}
                    placeholder="e.g. Demo / Test Drive"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
              </div>
            )}

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => { setModal({ open: false }); setError(""); }}
                className="px-4 py-2 rounded-xl text-sm font-medium border transition-all"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {saving ? "Saving…" : modal.mode === "add" ? "Add" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6"
            style={{ background: "var(--surface)" }}>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text)" }}>Confirm Delete</h2>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              This record will be permanently deleted. This will not affect existing gate passes.
            </p>
            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: "#fee2e2", color: "#dc2626" }}>{error}</div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setDeleteId(null); setError(""); }}
                className="px-4 py-2 rounded-xl text-sm font-medium border"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: "#dc2626", color: "#fff" }}>
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button onClick={onEdit}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface2)" }}>
        Edit
      </button>
      <button onClick={onDelete}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        style={{ background: "#fee2e2", color: "#dc2626" }}>
        Delete
      </button>
    </div>
  );
}
