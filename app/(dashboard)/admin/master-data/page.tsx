"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────
type Tab = "carrier" | "driver" | "outReason" | "brand" | "ltStatus" | "cdNotify" | "sapReconNotify" | "maintenance" | "systemNotice" | "plantCache";

type CarrierRecord = { id: string; companyName: string; registrationNo: string; createdAt: string };
type DriverRecord  = { id: string; name: string; nic: string; licenceNo: string | null; contact: string | null; carrierId: string | null; carrier: { id: string; companyName: string; registrationNo: string } | null; createdAt: string };
type OutReasonRecord = { id: string; value: string; createdAt: string };
type BrandRecord = { id: string; name: string; createdAt: string };
type LtStatusRecord = { code: string; enabled: boolean; isCatchAll: boolean };
type CdRecipientRecord = { id: string; name: string; email: string; createdAt: string };
type SapReconRecipientRecord = { id: string; name: string; email: string; createdAt: string };

type ModalState =
  | { open: false }
  | { open: true; mode: "add" | "edit"; type: "carrier";   data?: CarrierRecord }
  | { open: true; mode: "add" | "edit"; type: "driver";    data?: DriverRecord }
  | { open: true; mode: "add" | "edit"; type: "outReason"; data?: OutReasonRecord }
  | { open: true; mode: "add" | "edit"; type: "brand";     data?: BrandRecord };

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Same format rules already enforced on the Gate Pass creation form's driver fields.
function isValidNIC(v: string) {
  return /^[0-9]{9}[VvXx]$/.test(v.trim()) || /^[0-9]{12}$/.test(v.trim());
}
// Sri Lankan driving licence number: 1 letter followed by 7 digits (e.g. B1234567).
function isValidLicenceNo(v: string) {
  return /^[A-Za-z][0-9]{7}$/.test(v.trim());
}
function isValidPhone(v: string) {
  return /^[0-9+\-\s]{7,15}$/.test(v.trim());
}

// ISO string (from the API/DB) -> the "YYYY-MM-DDTHH:mm" shape a <input type="datetime-local">
// needs, in the browser's local time (matches how the admin picks a time in that same input).
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtMaintenanceDateTime(value: string): string {
  if (!value) return "Not set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtRemaining(endValue: string, now: number): string | null {
  if (!endValue) return null;
  const end = new Date(endValue).getTime();
  if (Number.isNaN(end)) return null;
  const ms = Math.max(0, end - now);
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
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
  const [brands,   setBrands]   = useState<BrandRecord[]>([]);
  const [ltStatuses, setLtStatuses] = useState<LtStatusRecord[]>([]);
  const [cdRecipients, setCdRecipients] = useState<CdRecipientRecord[]>([]);
  const [sapReconRecipients, setSapReconRecipients] = useState<SapReconRecipientRecord[]>([]);
  const [maintenance, setMaintenance] = useState({ enabled: false, message: "", startAt: "", endAt: "" });
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceNow, setMaintenanceNow] = useState(() => Date.now());
  const [systemNoticeEnabled, setSystemNoticeEnabled] = useState(false);
  const [systemNoticeSaving, setSystemNoticeSaving] = useState(false);
  const [plantCache, setPlantCache] = useState<{
    lastSync: { startedAt: string; finishedAt: string | null; status: string; vehicleCount: number | null; locationCount: number | null; trigger: string; error: string | null } | null;
    vehicleCount: number;
    materialCount: number;
  }>({ lastSync: null, vehicleCount: 0, materialCount: 0 });
  const [plantCacheSyncing, setPlantCacheSyncing] = useState(false);
  const [plantCacheRows, setPlantCacheRows] = useState<{
    chassisNo: string; internalNo: string; externalNo: string; materialNo: string;
    plantDescription: string; storageDescription: string;
    destinations: { plantDescription: string; storageDescription: string }[];
    syncedAt: string;
  }[]>([]);
  const [plantCacheTotal, setPlantCacheTotal] = useState(0);
  const [plantCacheSearch, setPlantCacheSearch] = useState("");
  const [plantCacheRowsLoading, setPlantCacheRowsLoading] = useState(false);
  const [plantCacheMaterialRows, setPlantCacheMaterialRows] = useState<{
    materialNo: string; vehicleCount: number;
    destinations: { plantDescription: string; storageDescription: string }[];
    lastSyncedAt: string | null;
  }[]>([]);
  const [plantCacheMaterialTotal, setPlantCacheMaterialTotal] = useState(0);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());
  const [materialFetchSingle, setMaterialFetchSingle] = useState("");
  const [materialFetchBatch, setMaterialFetchBatch] = useState("");
  const [materialFetchRunning, setMaterialFetchRunning] = useState(false);
  const [materialFetchResults, setMaterialFetchResults] = useState<{
    materialNo: string; success: boolean; vehicleCount: number; destinationCount: number; error?: string;
  }[]>([]);
  const [adQuery, setAdQuery] = useState("");
  const [adOptions, setAdOptions] = useState<{ id: string; name: string; email: string }[]>([]);
  const [adLoading, setAdLoading] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState<ModalState>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  // Form state
  const [formCarrier,   setFormCarrier]   = useState({ companyName: "", registrationNo: "" });
  const [formDriver,    setFormDriver]    = useState({ name: "", nic: "", licenceNo: "", contact: "", carrierId: "" });
  const [formOutReason, setFormOutReason] = useState({ value: "" });
  const [formBrand,     setFormBrand]     = useState({ name: "" });

  // Carrier options for the Driver form's mandatory Carrier Company selector —
  // loaded independently of the active tab so it's always ready when the Driver modal opens.
  const [allCarriers, setAllCarriers] = useState<CarrierRecord[]>([]);
  useEffect(() => {
    fetch("/api/admin/master-data?type=carrier&q=")
      .then(r => r.json())
      .then(json => setAllCarriers(json.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status === "authenticated" && (session as any)?.user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [status, session, router]);

  const load = useCallback(async (t: Tab, q = "") => {
    setLoading(true);
    try {
      if (t === "ltStatus") {
        const res = await fetch("/api/admin/lt-status-config");
        const json = await res.json();
        setLtStatuses(json.data ?? []);
        return;
      }
      if (t === "cdNotify") {
        const res = await fetch("/api/admin/cd-notification-recipients");
        const json = await res.json();
        setCdRecipients(json.data ?? []);
        return;
      }
      if (t === "sapReconNotify") {
        const res = await fetch("/api/admin/sap-reconciliation-recipients");
        const json = await res.json();
        setSapReconRecipients(json.data ?? []);
        return;
      }
      if (t === "maintenance") {
        const res = await fetch("/api/admin/maintenance");
        const json = await res.json();
        setMaintenance({
          enabled: !!json.enabled,
          message: json.message ?? "",
          startAt: toDatetimeLocalValue(json.startAt),
          endAt: toDatetimeLocalValue(json.endAt),
        });
        return;
      }
      if (t === "systemNotice") {
        const res = await fetch("/api/admin/system-notice");
        const json = await res.json();
        setSystemNoticeEnabled(!!json.enabled);
        return;
      }
      if (t === "plantCache") {
        const res = await fetch("/api/admin/plant-cache");
        const json = await res.json();
        setPlantCache({ lastSync: json.lastSync ?? null, vehicleCount: json.vehicleCount ?? 0, materialCount: json.materialCount ?? 0 });
        return;
      }
      const res = await fetch(`/api/admin/master-data?type=${t}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (t === "carrier")   setCarriers(json.data ?? []);
      if (t === "driver")    setDrivers(json.data ?? []);
      if (t === "outReason") setReasons(json.data ?? []);
      if (t === "brand")     setBrands(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSearch("");
    setAdQuery(""); setAdOptions([]); setAdOpen(false);
    load(tab, "");
  }, [tab, load]);

  // debounced search
  useEffect(() => {
    if (tab === "ltStatus" || tab === "cdNotify" || tab === "sapReconNotify" || tab === "maintenance" || tab === "systemNotice" || tab === "plantCache") return;
    const t = setTimeout(() => load(tab, search), 300);
    return () => clearTimeout(t);
  }, [search, tab, load]);

  // Empty search → material-grouped view (the useful default, since SAP's destination list is
  // per-material, not per chassis). Non-empty search → flat per-vehicle view so a chassis
  // number can actually be found; that's the only time the Chassis No column is shown.
  const loadPlantCacheRows = useCallback(async (q: string) => {
    setPlantCacheRowsLoading(true);
    try {
      if (!q.trim()) {
        const res = await fetch(`/api/admin/plant-cache/materials?take=50`);
        const json = await res.json();
        setPlantCacheMaterialRows(json.rows ?? []);
        setPlantCacheMaterialTotal(json.total ?? 0);
      } else {
        const res = await fetch(`/api/admin/plant-cache/vehicles?q=${encodeURIComponent(q)}&take=50`);
        const json = await res.json();
        setPlantCacheRows(json.rows ?? []);
        setPlantCacheTotal(json.total ?? 0);
      }
    } catch {
      setPlantCacheMaterialRows([]); setPlantCacheMaterialTotal(0);
      setPlantCacheRows([]); setPlantCacheTotal(0);
    } finally {
      setPlantCacheRowsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "plantCache") return;
    const t = setTimeout(() => { void loadPlantCacheRows(plantCacheSearch); }, 300);
    return () => clearTimeout(t);
  }, [plantCacheSearch, tab, loadPlantCacheRows]);

  // Live "Remaining" ticker for the Maintenance Mode tab's status summary — only runs while
  // that tab is open and an end time is actually configured.
  useEffect(() => {
    if (tab !== "maintenance" || !maintenance.endAt) return;
    const id = setInterval(() => setMaintenanceNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tab, maintenance.endAt]);

  function searchAd(q: string) {
    setAdQuery(q);
    setAdOpen(true);
    if (!q.trim()) { setAdOptions([]); return; }
    setAdLoading(true);
    fetch(`/api/ad-users?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then((d: { users?: { id: string; name: string; email: string }[] }) => setAdOptions(d.users ?? []))
      .catch(() => setAdOptions([]))
      .finally(() => setAdLoading(false));
  }

  async function addCdRecipient(u: { name: string; email: string }) {
    setError("");
    const res = await fetch("/api/admin/cd-notification-recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: u.name, email: u.email }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to add recipient");
      return;
    }
    setAdQuery(""); setAdOptions([]); setAdOpen(false);
    load("cdNotify");
  }

  async function removeCdRecipient(id: string) {
    setError("");
    const res = await fetch(`/api/admin/cd-notification-recipients?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to remove recipient");
      return;
    }
    load("cdNotify");
  }

  async function addSapReconRecipient(u: { name: string; email: string }) {
    setError("");
    const res = await fetch("/api/admin/sap-reconciliation-recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: u.name, email: u.email }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to add recipient");
      return;
    }
    setAdQuery(""); setAdOptions([]); setAdOpen(false);
    load("sapReconNotify");
  }

  async function removeSapReconRecipient(id: string) {
    setError("");
    const res = await fetch(`/api/admin/sap-reconciliation-recipients?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to remove recipient");
      return;
    }
    load("sapReconNotify");
  }

  async function toggleLtStatus(code: string, enabled: boolean) {
    setLtStatuses(prev => prev.map(s => s.code === code ? { ...s, enabled } : s));
    setError("");
    const res = await fetch("/api/admin/lt-status-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, enabled }),
    });
    if (!res.ok) {
      setLtStatuses(prev => prev.map(s => s.code === code ? { ...s, enabled: !enabled } : s));
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to save");
    }
  }

  const ltStatusGroups = ltStatuses.reduce<{ family: string; items: LtStatusRecord[] }[]>((groups, s) => {
    const family = s.code.match(/^[A-Za-z]+/)?.[0] ?? s.code;
    const last = groups[groups.length - 1];
    if (last && last.family === family) last.items.push(s);
    else groups.push({ family, items: [s] });
    return groups;
  }, []);

  function openAdd(t: Tab) {
    setError(""); setSuccess("");
    if (t === "carrier")   setFormCarrier({ companyName: "", registrationNo: "" });
    if (t === "driver")    setFormDriver({ name: "", nic: "", licenceNo: "", contact: "", carrierId: "" });
    if (t === "outReason") setFormOutReason({ value: "" });
    if (t === "brand")     setFormBrand({ name: "" });
    setModal({ open: true, mode: "add", type: t } as ModalState);
  }

  function openEdit(t: Tab, record: CarrierRecord | DriverRecord | OutReasonRecord | BrandRecord) {
    setError(""); setSuccess("");
    if (t === "carrier") {
      const r = record as CarrierRecord;
      setFormCarrier({ companyName: r.companyName, registrationNo: r.registrationNo });
      setModal({ open: true, mode: "edit", type: "carrier", data: r });
    } else if (t === "driver") {
      const r = record as DriverRecord;
      setFormDriver({ name: r.name, nic: r.nic, licenceNo: r.licenceNo ?? "", contact: r.contact ?? "", carrierId: r.carrierId ?? "" });
      setModal({ open: true, mode: "edit", type: "driver", data: r });
    } else if (t === "outReason") {
      const r = record as OutReasonRecord;
      setFormOutReason({ value: r.value });
      setModal({ open: true, mode: "edit", type: "outReason", data: r });
    } else {
      const r = record as BrandRecord;
      setFormBrand({ name: r.name });
      setModal({ open: true, mode: "edit", type: "brand", data: r });
    }
  }

  async function handleSave() {
    if (!modal.open) return;
    if (modal.type === "driver" && !formDriver.carrierId) {
      setError("Please select a Carrier Company — a driver must be assigned to one.");
      return;
    }
    if (modal.type === "driver" && !isValidNIC(formDriver.nic)) {
      setError("Invalid NIC format (e.g. 123456789V or 200012345678).");
      return;
    }
    if (modal.type === "driver" && !isValidLicenceNo(formDriver.licenceNo)) {
      setError("Invalid Driving Licence No. format (e.g. B1234567 — 1 letter followed by 7 digits).");
      return;
    }
    if (modal.type === "driver" && formDriver.contact && !isValidPhone(formDriver.contact)) {
      setError("Invalid contact number format.");
      return;
    }
    setSaving(true); setError("");
    try {
      let body: Record<string, string> = { type: modal.type };
      if (modal.type === "carrier")   body = { ...body, ...formCarrier };
      if (modal.type === "driver")    body = { ...body, ...formDriver };
      if (modal.type === "outReason") body = { ...body, ...formOutReason };
      if (modal.type === "brand")     body = { ...body, ...formBrand };

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
      if (modal.type === "carrier") {
        fetch("/api/admin/master-data?type=carrier&q=").then(r => r.json()).then(j => setAllCarriers(j.data ?? [])).catch(() => {});
      }
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

  async function saveMaintenance(next: { enabled: boolean; message: string; startAt: string; endAt: string }) {
    setMaintenanceSaving(true); setError("");
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: next.enabled,
          message: next.message,
          startAt: next.startAt || null,
          endAt: next.endAt || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to update maintenance mode"); return; }
      setMaintenance({
        enabled: !!json.enabled,
        message: json.message ?? "",
        startAt: toDatetimeLocalValue(json.startAt),
        endAt: toDatetimeLocalValue(json.endAt),
      });
      setSuccess(next.enabled ? "Maintenance mode turned ON" : "Maintenance mode turned OFF");
    } finally {
      setMaintenanceSaving(false);
    }
  }

  // Bumps the end time by N minutes from whichever is later — the current configured end
  // time, or now (covers both "extend an already-running window" and "no end time set yet").
  function extendMaintenanceBy(minutes: number) {
    const currentEnd = maintenance.endAt ? new Date(maintenance.endAt) : null;
    const base = currentEnd && !Number.isNaN(currentEnd.getTime()) && currentEnd.getTime() > Date.now()
      ? currentEnd
      : new Date();
    const nextEnd = toDatetimeLocalValue(new Date(base.getTime() + minutes * 60_000).toISOString());
    setMaintenance(p => ({ ...p, endAt: nextEnd }));
    void saveMaintenance({ ...maintenance, endAt: nextEnd });
  }

  async function saveSystemNotice(next: boolean) {
    setSystemNoticeSaving(true); setError("");
    try {
      const res = await fetch("/api/admin/system-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to update system notice"); return; }
      setSystemNoticeEnabled(!!json.enabled);
      setSuccess(next ? "System notice turned ON" : "System notice turned OFF");
    } finally {
      setSystemNoticeSaving(false);
    }
  }

  function togglePlantCacheMaterial(materialNo: string) {
    setExpandedMaterials(prev => {
      const next = new Set(prev);
      if (next.has(materialNo)) next.delete(materialNo); else next.add(materialNo);
      return next;
    });
  }

  async function syncPlantCacheNow() {
    setPlantCacheSyncing(true); setError("");
    try {
      const res = await fetch("/api/admin/plant-cache", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Plant cache sync failed"); return; }
      await Promise.all([load("plantCache"), loadPlantCacheRows(plantCacheSearch)]);
      setSuccess(`Plant cache synced — ${json.vehicleCount ?? 0} vehicles, ${json.locationCount ?? 0} locations`);
    } catch {
      setError("Plant cache sync failed");
    } finally {
      setPlantCacheSyncing(false);
    }
  }

  async function runMaterialFetch(materialNos: string[]) {
    if (materialNos.length === 0) return;
    setMaterialFetchRunning(true); setError("");
    try {
      const res = await fetch("/api/admin/plant-cache/material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialNos }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Material fetch failed"); return; }
      setMaterialFetchResults(json.results ?? []);
      setSuccess(`Material fetch complete — ${json.succeeded ?? 0} succeeded, ${json.failed ?? 0} failed`);
      await Promise.all([load("plantCache"), loadPlantCacheRows(plantCacheSearch)]);
    } catch {
      setError("Material fetch failed");
    } finally {
      setMaterialFetchRunning(false);
    }
  }

  function handleMaterialFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setMaterialFetchBatch(prev => (prev.trim() ? `${prev.trim()}\n${text}` : text));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function parseMaterialBatch(text: string): string[] {
    return [...new Set(text.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean))];
  }

  if (status === "loading") return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "carrier",   label: "Carrier Details" },
    { id: "driver",    label: "Driver Details"  },
    { id: "outReason", label: "Out Reasons"     },
    { id: "brand",     label: "Brands"          },
    { id: "ltStatus",  label: "LT Vehicle Statuses" },
    { id: "cdNotify",  label: "CD Notifications" },
    { id: "sapReconNotify", label: "SAP Reconciliation Notifications" },
    { id: "maintenance", label: "Maintenance Mode" },
    { id: "systemNotice", label: "System Notice" },
    { id: "plantCache", label: "Plant/Material Cache" },
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
        {tab === "ltStatus" ? (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Only vehicles whose SAP status is checked below will appear in the Location Transfer vehicle dropdown.
              All statuses are selected by default. Changes save immediately and apply the next time vehicles are searched.
            </p>
          </div>
        ) : tab === "maintenance" ? (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              When ON, every user except Admins is redirected to a maintenance screen on every page until an Admin
              turns it back OFF. There is no automatic schedule — this is a manual switch only.
            </p>
          </div>
        ) : tab === "systemNotice" ? (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              When ON, the SAP S/4 HANA planned downtime notice is shown at the top of every page for every signed-in
              user, including Admins. This is an informational banner only — it never blocks access.
            </p>
          </div>
        ) : tab === "cdNotify" ? (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
              These recipients get emailed with vehicle/delivery details whenever a Customer Delivery gate pass completes
              (via Initiator Print or Security Gate Out). Search Active Directory to add someone.
            </p>
            <div className="relative max-w-md">
              <input
                type="text" placeholder="Search Active Directory by name or email…"
                value={adQuery}
                onChange={e => searchAd(e.target.value)}
                onFocus={() => setAdOpen(true)}
                onBlur={() => setTimeout(() => setAdOpen(false), 150)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              {adOpen && adQuery.trim() && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border shadow-lg max-h-64 overflow-y-auto"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  {adLoading ? (
                    <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>Searching…</div>
                  ) : adOptions.length === 0 ? (
                    <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>No matches found</div>
                  ) : adOptions.map(u => (
                    <button key={u.id} type="button"
                      onMouseDown={() => addCdRecipient({ name: u.name, email: u.email })}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{ color: "var(--text)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === "sapReconNotify" ? (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
              These recipients get the SAP Reconciliation "ready to write" list email and the "writing now" notice sent
              right before the scheduled automatic SAP write. Separate from CD Notifications above. Search Active
              Directory to add someone.
            </p>
            <div className="relative max-w-md">
              <input
                type="text" placeholder="Search Active Directory by name or email…"
                value={adQuery}
                onChange={e => searchAd(e.target.value)}
                onFocus={() => setAdOpen(true)}
                onBlur={() => setTimeout(() => setAdOpen(false), 150)}
                onKeyDown={e => {
                  if (e.key === "Enter" && adOptions.length > 0) {
                    e.preventDefault();
                    addSapReconRecipient({ name: adOptions[0].name, email: adOptions[0].email });
                  }
                }}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              {adOpen && adQuery.trim() && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border shadow-lg max-h-64 overflow-y-auto"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  {adLoading ? (
                    <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>Searching…</div>
                  ) : adOptions.length === 0 ? (
                    <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>No matches found</div>
                  ) : adOptions.map(u => (
                    <button key={u.id} type="button"
                      onMouseDown={() => addSapReconRecipient({ name: u.name, email: u.email })}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{ color: "var(--text)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{u.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === "plantCache" ? (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              A local copy of SAP&apos;s vehicle/material/plant-location data, used only for destination-dropdown and
              current-location display (never for Location Transfer / Customer Delivery eligibility, or SAP writes —
              those stay fully live). Syncs automatically once a day at midnight; use &quot;Sync Now&quot; below to
              refresh it immediately.
            </p>
          </div>
        ) : (
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
        )}

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
                    {["Driver Name", "NIC", "Licence No.", "Carrier Company", "Contact", "Added On", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drivers.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No drivers found</td></tr>
                  ) : drivers.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.nic}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.licenceNo ?? "—"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.carrier?.companyName ?? "—"}</td>
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

            {/* Brands tab */}
            {tab === "brand" && (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Brand Name", "Added On", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {brands.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No brands found</td></tr>
                  ) : brands.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{r.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <RowActions onEdit={() => openEdit("brand", r)} onDelete={() => setDeleteId(r.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* LT Vehicle Statuses tab */}
            {tab === "ltStatus" && (
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ltStatusGroups.length === 0 ? (
                  <div className="col-span-full px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No statuses found</div>
                ) : ltStatusGroups.map(g => (
                  <div key={g.family} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>{g.family}</h3>
                    <div className="space-y-2">
                      {g.items.map(s => (
                        <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text)" }}>
                          <input
                            type="checkbox"
                            checked={s.enabled}
                            onChange={e => toggleLtStatus(s.code, e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="font-mono">{s.code}</span>
                          {s.isCatchAll && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>(other {g.family} codes)</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CD Notifications tab */}
            {tab === "cdNotify" && (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Name", "Email", "Added On", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cdRecipients.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No recipients configured — search Active Directory above to add one</td></tr>
                  ) : cdRecipients.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{r.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.email}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeCdRecipient(r.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: "#fee2e2", color: "#dc2626" }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* SAP Reconciliation Notifications tab */}
            {tab === "sapReconNotify" && (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                    {["Name", "Email", "Added On", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sapReconRecipients.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No recipients configured — search Active Directory above to add one</td></tr>
                  ) : sapReconRecipients.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>{r.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{r.email}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeSapReconRecipient(r.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: "#fee2e2", color: "#dc2626" }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Maintenance Mode tab */}
            {tab === "maintenance" && (
              <div className="p-5 max-w-2xl">
                {error && (
                  <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: "#fee2e2", color: "#dc2626" }}>{error}</div>
                )}

                {/* Status summary */}
                <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        {maintenance.enabled && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "#dc2626" }} />
                        )}
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: maintenance.enabled ? "#dc2626" : "#94a3b8" }} />
                      </span>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {maintenance.enabled ? "Maintenance Active" : "Maintenance mode is OFF"}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={maintenance.enabled}
                      disabled={maintenanceSaving}
                      onClick={() => saveMaintenance({ ...maintenance, enabled: !maintenance.enabled })}
                      className="relative w-16 h-9 rounded-full transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{
                        background: maintenance.enabled
                          ? "linear-gradient(135deg,#ef4444,#dc2626)"
                          : "linear-gradient(135deg,#e2e8f0,#cbd5e1)",
                        boxShadow: maintenance.enabled
                          ? "inset 0 1px 3px rgba(0,0,0,0.15), 0 0 0 1px rgba(220,38,38,0.25)"
                          : "inset 0 1px 3px rgba(0,0,0,0.08)",
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ["--tw-ring-color" as any]: maintenance.enabled ? "#fecaca" : "#cbd5e1",
                      }}
                      aria-label="Toggle maintenance mode"
                    >
                      <span
                        className="absolute top-1 left-1 w-7 h-7 rounded-full bg-white flex items-center justify-center text-[9px] font-bold transition-transform duration-200 ease-in-out"
                        style={{
                          transform: maintenance.enabled ? "translateX(1.75rem)" : "translateX(0)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15)",
                          color: maintenance.enabled ? "#dc2626" : "#94a3b8",
                        }}
                      >
                        {maintenance.enabled ? "ON" : "OFF"}
                      </span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>Start</p>
                      <p style={{ color: "var(--text)" }}>{fmtMaintenanceDateTime(maintenance.startAt)}</p>
                    </div>
                    <div>
                      <p className="font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>Expected End</p>
                      <p style={{ color: "var(--text)" }}>{fmtMaintenanceDateTime(maintenance.endAt)}</p>
                    </div>
                    <div>
                      <p className="font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>Remaining</p>
                      <p className="font-mono font-semibold" style={{ color: "var(--text)" }}>
                        {maintenance.enabled ? (fmtRemaining(maintenance.endAt, maintenanceNow) ?? "—") : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Schedule + message form */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Start date/time</label>
                    <input
                      type="datetime-local"
                      value={maintenance.startAt}
                      onChange={e => setMaintenance(p => ({ ...p, startAt: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>Expected end date/time</label>
                    <input
                      type="datetime-local"
                      value={maintenance.endAt}
                      onChange={e => setMaintenance(p => ({ ...p, endAt: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Extend:</span>
                      {[15, 30, 60].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          disabled={maintenanceSaving}
                          onClick={() => extendMaintenanceBy(mins)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                          style={{ background: "#e4ecf8", color: "#1E4FA0" }}
                        >
                          +{mins < 60 ? `${mins}m` : "1h"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                  Optional message shown in the maintenance overlay
                </label>
                <textarea
                  value={maintenance.message}
                  onChange={e => setMaintenance(p => ({ ...p, message: e.target.value }))}
                  placeholder="e.g. Thank you for your patience while we complete this upgrade."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
                  style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                />
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={maintenanceSaving}
                    onClick={() => saveMaintenance(maintenance)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {maintenanceSaving ? "Saving…" : "Update"}
                  </button>
                </div>
              </div>
            )}

            {/* System Notice tab */}
            {tab === "systemNotice" && (
              <div className="p-5 max-w-xl">
                {error && (
                  <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: "#fee2e2", color: "#dc2626" }}>{error}</div>
                )}
                <div className="flex items-center justify-between rounded-xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                      System notice is currently {systemNoticeEnabled ? "ON" : "OFF"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {systemNoticeEnabled ? "The SAP downtime notice is showing at the top of every page right now." : "No notice is shown to users."}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={systemNoticeEnabled}
                    disabled={systemNoticeSaving}
                    onClick={() => saveSystemNotice(!systemNoticeEnabled)}
                    className="relative w-16 h-9 rounded-full transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{
                      background: systemNoticeEnabled
                        ? "linear-gradient(135deg,#f59e0b,#d97706)"
                        : "linear-gradient(135deg,#e2e8f0,#cbd5e1)",
                      boxShadow: systemNoticeEnabled
                        ? "inset 0 1px 3px rgba(0,0,0,0.15), 0 0 0 1px rgba(217,119,6,0.25)"
                        : "inset 0 1px 3px rgba(0,0,0,0.08)",
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ["--tw-ring-color" as any]: systemNoticeEnabled ? "#fde68a" : "#cbd5e1",
                    }}
                    aria-label="Toggle system notice"
                  >
                    <span
                      className="absolute top-1 left-1 w-7 h-7 rounded-full bg-white flex items-center justify-center text-[9px] font-bold transition-transform duration-200 ease-in-out"
                      style={{
                        transform: systemNoticeEnabled ? "translateX(1.75rem)" : "translateX(0)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15)",
                        color: systemNoticeEnabled ? "#d97706" : "#94a3b8",
                      }}
                    >
                      {systemNoticeEnabled ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
                <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                  Notice text: Planned SAP S/4 HANA Downtime — Friday, 18th September 2026, 20:00 H to Sunday, 20th
                  September 2026, 17:00 H. Impact: All DIMO SAP / VSS Users.
                </p>
              </div>
            )}

            {/* Plant/Material Cache tab */}
            {tab === "plantCache" && (
              <div className="p-5">
                {error && (
                  <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: "#fee2e2", color: "#dc2626" }}>{error}</div>
                )}
                <div className="rounded-xl border p-4 max-w-2xl" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        Last sync: {plantCache.lastSync
                          ? `${fmtMaintenanceDateTime(plantCache.lastSync.startedAt)} — ${plantCache.lastSync.status}${plantCache.lastSync.trigger === "MANUAL" ? " (manual)" : " (automatic)"}`
                          : "Never synced yet"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {plantCache.vehicleCount} vehicles cached, {plantCache.materialCount} materials cached.
                      </p>
                      {plantCache.lastSync?.status === "FAILED" && plantCache.lastSync.error && (
                        <p className="text-xs mt-1" style={{ color: "#dc2626" }}>Last sync error: {plantCache.lastSync.error}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={plantCacheSyncing}
                      onClick={syncPlantCacheNow}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {plantCacheSyncing ? "Syncing…" : "Sync Now"}
                    </button>
                  </div>
                </div>

                {/* Fetch by Material Number — calls SAP /plant filtered by Matnr (not used anywhere
                    else in this app, only ever tried with Vhvin before), one material at a time.
                    Test a single material first before pasting/uploading a full list. */}
                <div className="mt-5 rounded-xl border p-4 max-w-3xl" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>Fetch by Material Number</p>
                  <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                    Calls SAP directly for a specific material (Matnr) and caches whatever it returns. Try a single
                    material first to confirm SAP accepts this filter before running a full list.
                  </p>

                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="text" placeholder="e.g. W1K205076"
                      value={materialFetchSingle} onChange={e => setMaterialFetchSingle(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && materialFetchSingle.trim()) void runMaterialFetch([materialFetchSingle.trim()]); }}
                      className="w-64 px-3 py-2 rounded-lg text-sm border outline-none"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                    <button
                      type="button"
                      disabled={materialFetchRunning || !materialFetchSingle.trim()}
                      onClick={() => void runMaterialFetch([materialFetchSingle.trim()])}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {materialFetchRunning ? "Fetching…" : "Fetch One"}
                    </button>
                  </div>

                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text)" }}>Or fetch a batch</p>
                  <textarea
                    value={materialFetchBatch} onChange={e => setMaterialFetchBatch(e.target.value)}
                    placeholder="Paste material numbers here — one per line, or comma-separated…"
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none font-mono resize-y"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <label className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
                      Upload .txt / .csv
                      <input type="file" accept=".txt,.csv" className="hidden" onChange={handleMaterialFileUpload} />
                    </label>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {parseMaterialBatch(materialFetchBatch).length} material{parseMaterialBatch(materialFetchBatch).length === 1 ? "" : "s"} ready
                    </span>
                    <button
                      type="button"
                      disabled={materialFetchRunning || parseMaterialBatch(materialFetchBatch).length === 0}
                      onClick={() => void runMaterialFetch(parseMaterialBatch(materialFetchBatch))}
                      className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      {materialFetchRunning ? "Fetching…" : "Fetch All"}
                    </button>
                  </div>

                  {materialFetchResults.length > 0 && (
                    <div className="mt-4 rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                              {["Material No", "Result", "Vehicles", "Destinations"].map((h, i) => (
                                <th key={i} className="px-3 py-2 text-left font-semibold uppercase tracking-wide"
                                  style={{ color: "var(--text-muted)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {materialFetchResults.map((r, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{r.materialNo}</td>
                                <td className="px-3 py-2" style={{ color: r.success ? "#16a34a" : "#dc2626" }}>
                                  {r.success ? "OK" : (r.error || "Failed")}
                                </td>
                                <td className="px-3 py-2" style={{ color: "var(--text)" }}>{r.vehicleCount}</td>
                                <td className="px-3 py-2" style={{ color: "var(--text)" }}>{r.destinationCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cached content viewer — lets an admin see real data, not just counts, while testing.
                    Empty search = grouped by Material No (SAP's destinations are per-material, so this
                    is the more meaningful default). Typed search = flat per-vehicle results, with the
                    Chassis No column only shown here since that's the only time it's useful. */}
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <input
                      type="text" placeholder="Search by chassis, material no, or plant…"
                      value={plantCacheSearch} onChange={e => setPlantCacheSearch(e.target.value)}
                      className="w-80 px-3 py-2 rounded-lg text-sm border outline-none"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {plantCacheRowsLoading
                        ? "Loading…"
                        : plantCacheSearch.trim()
                          ? `Showing ${plantCacheRows.length} of ${plantCacheTotal} vehicles`
                          : `Showing ${plantCacheMaterialRows.length} of ${plantCacheMaterialTotal} materials`}
                    </span>
                  </div>

                  {!plantCacheSearch.trim() ? (
                    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                            {["Material No", "Vehicles", "Extended Locations", "Last Synced"].map((h, i) => (
                              <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: "var(--text-muted)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {plantCacheMaterialRows.length === 0 ? (
                            <tr><td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                              {plantCacheRowsLoading ? "Loading…" : "No cached materials found — try a sync."}
                            </td></tr>
                          ) : plantCacheMaterialRows.map(m => {
                            const isExpanded = expandedMaterials.has(m.materialNo);
                            return (
                              <tr key={m.materialNo} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: "var(--text)" }}>{m.materialNo}</td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text)" }}>{m.vehicleCount}</td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text)" }}>
                                  <button type="button" onClick={() => togglePlantCacheMaterial(m.materialNo)}
                                    className="font-medium underline decoration-dotted" style={{ color: "var(--accent)" }}>
                                    {m.destinations.length} location{m.destinations.length === 1 ? "" : "s"} — {isExpanded ? "hide" : "show all"}
                                  </button>
                                  {isExpanded && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 max-w-2xl">
                                      {m.destinations.map((d, i) => (
                                        <span key={i} className="px-2 py-1 rounded-lg text-[11px]"
                                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                                          {d.plantDescription} - {d.storageDescription}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                                  {m.lastSyncedAt ? fmtMaintenanceDateTime(m.lastSyncedAt) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                            {["Chassis No", "Internal No", "Material No", "Current Location", "Destinations", "Synced At"].map((h, i) => (
                              <th key={i} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: "var(--text-muted)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {plantCacheRows.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                              {plantCacheRowsLoading ? "Loading…" : "No cached vehicles found — try a sync, or adjust your search."}
                            </td></tr>
                          ) : plantCacheRows.map(r => {
                            const isExpanded = expandedMaterials.has(r.chassisNo);
                            return (
                              <tr key={r.chassisNo} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--text)" }}>{r.chassisNo}</td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text)" }}>{r.internalNo || "—"}</td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text)" }}>{r.materialNo || "—"}</td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text)" }}>{r.plantDescription} - {r.storageDescription}</td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text)" }}>
                                  <button type="button" onClick={() => togglePlantCacheMaterial(r.chassisNo)}
                                    className="font-medium underline decoration-dotted" style={{ color: "var(--accent)" }}>
                                    {r.destinations.length} location{r.destinations.length === 1 ? "" : "s"} — {isExpanded ? "hide" : "show all"}
                                  </button>
                                  {isExpanded && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 max-w-xl">
                                      {r.destinations.map((d, i) => (
                                        <span key={i} className="px-2 py-1 rounded-lg text-[11px]"
                                          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                                          {d.plantDescription} - {d.storageDescription}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>{fmtMaintenanceDateTime(r.syncedAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
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
              {modal.type === "carrier" ? "Carrier" : modal.type === "driver" ? "Driver" : modal.type === "outReason" ? "Out Reason" : "Brand"}
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
                <Field label="Carrier Company *">
                  <select value={formDriver.carrierId}
                    onChange={e => setFormDriver(p => ({ ...p, carrierId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
                    <option value="">Select a carrier…</option>
                    {allCarriers.map(c => (
                      <option key={c.id} value={c.id}>{c.companyName} — {c.registrationNo}</option>
                    ))}
                  </select>
                  {allCarriers.length === 0 && (
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>No carriers exist yet — add one under Carrier Details first.</p>
                  )}
                </Field>
                <Field label="Driver Name *">
                  <input type="text" value={formDriver.name}
                    onChange={e => setFormDriver(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Kamal Perera"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
                <Field label="NIC *">
                  <input type="text" value={formDriver.nic}
                    onChange={e => setFormDriver(p => ({ ...p, nic: e.target.value }))}
                    placeholder="e.g. 901234567V"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }} />
                </Field>
                <Field label="Driving Licence No. *">
                  <input type="text" value={formDriver.licenceNo}
                    onChange={e => setFormDriver(p => ({ ...p, licenceNo: e.target.value }))}
                    placeholder="e.g. B1234567"
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

            {/* Brand form */}
            {modal.type === "brand" && (
              <div className="space-y-4">
                <Field label="Brand Name *">
                  <input type="text" value={formBrand.name}
                    onChange={e => setFormBrand({ name: e.target.value })}
                    placeholder="e.g. Toyota"
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
