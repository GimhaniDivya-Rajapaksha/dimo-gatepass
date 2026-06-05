"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type GatePass = {
  id: string;
  gatePassNumber: string;
  passType: string;
  passSubType: string | null;
  status: string;
  vehicle: string;
  chassis: string | null;
  toLocation: string | null;
  fromLocation: string | null;
  departureDate: string | null;
  serviceJobNo: string | null;
  paymentType: string | null;
  hasImmediate?: boolean;
  cashierCleared?: boolean;
  cashierOverrideRequested?: boolean;
  createdBy: { name: string; email: string };
  createdAt: string;
  parentPass: { id: string; gatePassNumber: string; vehicle: string; serviceJobNo: string | null } | null;
};

type ServiceOrder = {
  id: string;
  orderId: string;
  orderStatus: string;
  payTerm: string;
  isAssigned: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

// ── Slide to Confirm ──────────────────────────────────────────────────────────

function SlideToConfirm({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [pos, setPos] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const TRACK = 300;
  const HANDLE = 56;
  const MAX = TRACK - HANDLE;

  function start(x: number) { if (disabled) return; setDragging(true); startXRef.current = x - pos; }
  function move(x: number) {
    if (!dragging) return;
    const p = Math.max(0, Math.min(MAX, x - startXRef.current));
    setPos(p);
    if (p >= MAX - 2) { setDragging(false); setPos(0); onConfirm(); }
  }
  function end() { if (dragging) { setDragging(false); setPos(0); } }

  return (
    <div className="relative rounded-full select-none overflow-hidden"
      style={{ width: TRACK, height: 52, background: "#d1fae5", border: "2px solid #6ee7b7", opacity: disabled ? 0.5 : 1 }}
      onMouseMove={(e) => move(e.clientX)} onMouseUp={end} onMouseLeave={end}
      onTouchMove={(e) => move(e.touches[0].clientX)} onTouchEnd={end}
    >
      {/* Fill */}
      <div className="absolute inset-0 rounded-full" style={{ width: pos + HANDLE, background: "#10b981", opacity: 0.35 }} />
      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold pointer-events-none" style={{ color: "#065f46", paddingLeft: HANDLE + 4 }}>
        → Slide to Confirm Payment Cleared
      </div>
      {/* Handle */}
      <div className="absolute top-1 rounded-full flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing"
        style={{ left: pos + 4, width: HANDLE - 8, height: 44, background: "linear-gradient(135deg,#059669,#10b981)", transition: dragging ? "none" : "left 0.15s" }}
        onMouseDown={(e) => start(e.clientX)} onTouchStart={(e) => start(e.touches[0].clientX)}
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

// ── Order Assignment Modal ────────────────────────────────────────────────────

function OrderModal({
  pass,
  onClose,
  onProceed,
}: {
  pass: GatePass;
  onClose: () => void;
  onProceed: (result: { status: string; creditPending?: boolean }) => void;
}) {
  const jobNo = pass.serviceJobNo ?? pass.parentPass?.serviceJobNo ?? pass.gatePassNumber;
  const isCustomerDelivery = pass.passType === "CUSTOMER_DELIVERY";

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmProceed, setConfirmProceed] = useState(false);
  const [sapSyncing, setSapSyncing] = useState(false);
  const [sapSyncMsg, setSapSyncMsg] = useState<string | null>(null);


  // Selected checkboxes on the left (available) side
  const [selectedLeft, setSelectedLeft] = useState<Set<string>>(new Set());
  // Selected checkboxes on the right (assigned) side
  const [selectedRight, setSelectedRight] = useState<Set<string>>(new Set());
  // Post-proceed invoice screen
  const [proceeded, setProceeded] = useState(false);
  const [proceededResult, setProceededResult] = useState<{ status: string; creditPending?: boolean } | null>(null);
  const [snapshotPaidOrders, setSnapshotPaidOrders] = useState<ServiceOrder[]>([]);
  const [snapshotUnpaidOrders, setSnapshotUnpaidOrders] = useState<ServiceOrder[]>([]);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Cashier only handles immediate-payment orders; credit orders go to Approver separately
  const immediateTerms = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction", ""];
  const immediateOrders = orders.filter((o) => immediateTerms.includes((o.payTerm || "").toLowerCase().trim()));
  const creditOrders    = orders.filter((o) => {
    const t = (o.payTerm || "").toLowerCase().trim();
    return t !== "" && !immediateTerms.includes(t);
  });

  const available = immediateOrders.filter((o) => !o.isAssigned);
  const assigned   = immediateOrders.filter((o) => o.isAssigned);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/service-orders?gatePassId=${pass.id}`);
      const d = await res.json();
      setOrders(d.orders ?? []);
    } catch {
      setError("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [pass.id]);

  /** Sync orders from SAP into the DB, then refresh the list */
  const syncFromSap = useCallback(async () => {
    setSapSyncing(true);
    setSapSyncMsg(null);
    try {
      const vin      = pass.chassis  ?? "";
      const licplate = pass.vehicle  ?? "";
      const params   = new URLSearchParams();
      if (vin)      params.set("vin",      vin);
      if (licplate) params.set("licplate", licplate);

      const res = await fetch(`/api/sap/orders?${params.toString()}`);
      if (!res.ok) { setSapSyncMsg("SAP unavailable"); return; }

      type RawSapOrder = {
        orderId: string; orderStatus: string; billingType: string;
        payTerm: string; payTermCode: string; cancelled: boolean; isHappyPath: boolean;
      };
      const d: { orders?: RawSapOrder[]; error?: string } = await res.json();
      const sapOrders: RawSapOrder[] = d.orders ?? [];

      if (sapOrders.length === 0) {
        setSapSyncMsg("No orders found in SAP for this vehicle.");
        return;
      }

      // Upsert each SAP order into the DB (skip cancelled ones)
      const active = sapOrders.filter((o) => !o.cancelled);
      let added = 0;
      const existingIds = new Set(orders.map((o) => o.orderId));

      for (const o of active) {
        if (!o.orderId || existingIds.has(o.orderId)) continue;
        await fetch("/api/service-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gatePassId:  pass.id,
            orderId:     o.orderId,
            orderStatus: o.orderStatus || "Open",
            payTerm:     o.payTerm     || o.payTermCode || "Immediate",
          }),
        });
        added++;
      }

      await fetchOrders();
      setSapSyncMsg(
        added > 0
          ? `${added} order${added > 1 ? "s" : ""} imported from SAP.`
          : "All SAP orders already loaded."
      );
    } catch {
      setSapSyncMsg("Failed to sync from SAP.");
    } finally {
      setSapSyncing(false);
    }
  }, [pass.id, pass.chassis, pass.vehicle, orders, fetchOrders]);

  // Auto-sync from SAP when modal first opens
  useEffect(() => { void fetchOrders(); }, [fetchOrders]);
  useEffect(() => { void syncFromSap(); }, []); // eslint-disable-line react-hooks/exhaustive-deps



  async function handleDeleteOrder(id: string) {
    if (!window.confirm("Remove this order from the payment review list?")) return;
    await fetch(`/api/service-orders?id=${id}`, { method: "DELETE" });
    await fetchOrders();
  }

  // Move selected left items → assigned
  async function handleSwitchToAssigned() {
    if (selectedLeft.size === 0) return;
    setSaving(true);
    const newAssigned = new Set([...assigned.map((o) => o.id), ...selectedLeft]);
    await fetch("/api/service-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", gatePassId: pass.id, assignedIds: [...newAssigned] }),
    });
    setSelectedLeft(new Set());
    await fetchOrders();
    setSaving(false);
  }

  // Move selected right items → back to available
  async function handleSwitchToAvailable() {
    if (selectedRight.size === 0) return;
    setSaving(true);
    const newAssigned = assigned.filter((o) => !selectedRight.has(o.id)).map((o) => o.id);
    await fetch("/api/service-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", gatePassId: pass.id, assignedIds: newAssigned }),
    });
    setSelectedRight(new Set());
    await fetchOrders();
    setSaving(false);
  }

  async function handleProceed() {
    setSaving(true);
    setError(null);
    try {
      const res = isCustomerDelivery
        ? await fetch(`/api/gate-pass/${pass.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cashier_clear_cd" }),
          })
        : await fetch("/api/service-orders", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "proceed", gatePassId: pass.id }),
          });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to proceed"); return; }
      setConfirmProceed(false);
      setSnapshotPaidOrders([...assigned]);
      setSnapshotUnpaidOrders([...available]);
      setProceededResult({ status: d.status, creditPending: d.creditPending });
      setProceeded(true);
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    const el = invoiceRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=820,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment Receipt · ${pass.gatePassNumber}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:28px;color:#111;font-size:13px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
      .hdr h1{font-size:20px;font-weight:700}h2{font-size:13px;font-weight:600;margin-bottom:8px;color:#374151}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:7px 10px;text-align:left;border:1px solid #e5e7eb}
      td{padding:7px 10px;border:1px solid #e5e7eb;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;background:#f9fafb;padding:12px;border-radius:4px;border:1px solid #e5e7eb}
      .meta p{font-size:12px}.meta strong{display:block;font-size:10px;text-transform:uppercase;color:#6b7280;margin-bottom:2px}
      .footer{margin-top:24px;padding-top:12px;border-top:1px solid #d1d5db;font-size:11px;color:#6b7280;display:flex;justify-content:space-between}
      .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}
      @media print{button{display:none!important}}
    </style></head><body>
      <div class="hdr"><div><h1>Payment Receipt</h1><p style="font-size:12px;color:#6b7280;margin-top:4px">DIMO Gate Pass System</p></div><div style="text-align:right"><p style="font-size:18px;font-weight:700;font-family:monospace">${pass.gatePassNumber}</p><p style="font-size:11px;color:#6b7280">${new Date().toLocaleString()}</p></div></div>
      <div class="meta"><div><strong>Vehicle</strong>${pass.vehicle}</div><div><strong>Chassis</strong>${pass.chassis ?? "—"}</div><div><strong>Pass Type</strong>${pass.passType.replace(/_/g," ")}</div><div><strong>Cleared At</strong>${new Date().toLocaleString()}</div></div>
      <h2 style="color:#15803d">✓ Cleared Orders (${snapshotPaidOrders.length})</h2>
      <table><thead><tr><th>#</th><th>Order ID</th><th>Status</th><th>Pay Term</th></tr></thead><tbody>
      ${snapshotPaidOrders.length===0?`<tr><td colspan="4" style="text-align:center;color:#6b7280">No immediate orders — proceeded directly</td></tr>`:snapshotPaidOrders.map((o,i)=>`<tr><td>${i+1}</td><td><strong>${o.orderId}</strong></td><td>${o.orderStatus}</td><td>${o.payTerm}</td></tr>`).join("")}
      </tbody></table>
      ${snapshotUnpaidOrders.length>0?`<h2 style="color:#991b1b;margin-top:12px">✗ Unpaid Orders (${snapshotUnpaidOrders.length})</h2><table><thead><tr><th>#</th><th>Order ID</th><th>Status</th><th>Pay Term</th></tr></thead><tbody>${snapshotUnpaidOrders.map((o,i)=>`<tr style="background:#fef2f2"><td>${i+1}</td><td><strong>${o.orderId}</strong></td><td>${o.orderStatus}</td><td>${o.payTerm}</td></tr>`).join("")}</tbody></table>`:""}
      <div class="footer"><span>Generated by DIMO Gate Pass System</span><span class="badge">✓ Payment Cleared</span></div>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}>
      <motion.div
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "90vh" }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>
              {isCustomerDelivery ? "Review" : "Select"}{" "}
              <span className="font-mono" style={{ color: "var(--accent)" }}>{jobNo}</span>
              {" "}Orders
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {pass.vehicle} · {pass.gatePassNumber}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* SAP Sync button */}
            <button
              onClick={() => void syncFromSap()}
              disabled={sapSyncing}
              title="Refresh orders from SAP"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50"
              style={{ background: "var(--surface2)", borderColor: "#3b82f6", color: "#3b82f6" }}
            >
              {sapSyncing ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {sapSyncing ? "Syncing…" : "Sync SAP"}
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
              style={{ background: "var(--surface2)" }}>
              <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Workflow steps guide */}
        <div className="px-6 py-3 border-b flex-shrink-0 flex items-center gap-3"
          style={{ borderColor: "var(--border)", background: "#f8fafc" }}>
          {[
            { n: "1", text: "Immediate payment orders auto-loaded from SAP", done: immediateOrders.length > 0 },
            { n: "2", text: "Mark all immediate orders as Fully Paid", done: immediateOrders.length > 0 && available.length === 0 },
            { n: "3", text: available.length === 0 && immediateOrders.length > 0 ? `${isCustomerDelivery ? "Proceed" : "Slide to confirm"} — your part is done` : "Credit orders are handled by Approver in parallel", done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[10px]"
                style={{ background: step.done ? "#dcfce7" : "#e0f2fe", color: step.done ? "#15803d" : "#0369a1" }}>
                {step.done ? "✓" : step.n}
              </span>
              <span style={{ color: step.done ? "#15803d" : "var(--text-muted)" }}>{step.text}</span>
              {i < 2 && <span className="text-gray-300 mx-1">→</span>}
            </div>
          ))}
        </div>

        {/* SAP sync status message */}
        {sapSyncMsg && (
          <div className="px-6 py-2 text-xs font-medium flex items-center gap-2"
            style={{ background: sapSyncMsg.includes("Failed") || sapSyncMsg.includes("unavailable") ? "#fef2f2" : "#f0fdf4", color: sapSyncMsg.includes("Failed") || sapSyncMsg.includes("unavailable") ? "#991b1b" : "#15803d", borderBottom: "1px solid var(--border)" }}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sapSyncMsg.includes("Failed") || sapSyncMsg.includes("unavailable") ? "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" : "M5 13l4 4L19 7"} />
            </svg>
            {sapSyncMsg}
          </div>
        )}

        {/* Credit orders info banner */}
        {creditOrders.length > 0 && (
          <div className="px-6 py-2.5 flex items-center gap-2 text-xs flex-shrink-0"
            style={{ background: "#eff6ff", borderBottom: "1px solid #bfdbfe" }}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span style={{ color: "#1d4ed8" }}>
              <strong>{creditOrders.length} credit order{creditOrders.length > 1 ? "s" : ""}</strong> (e.g. 90 Days) are being reviewed by the <strong>Approver in the same location</strong> — not your responsibility.
            </span>
          </div>
        )}

        {/* Body: two columns */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin w-6 h-6" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] gap-0 h-full">
              {/* Left: Pending Payment */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                    Pending Payment
                    {available.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "#fef2f2", color: "#991b1b" }}>
                        {available.length} unpaid
                      </span>
                    )}
                  </p>
                  {available.length > 0 && (
                    <button
                      onClick={() =>
                        setSelectedLeft(
                          selectedLeft.size === available.length
                            ? new Set()
                            : new Set(available.map((o) => o.id))
                        )
                      }
                      className="flex items-center gap-1.5 cursor-pointer select-none transition-all"
                    >
                      {/* Checkbox */}
                      <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          background: selectedLeft.size === available.length ? "#2563eb" : "transparent",
                          borderColor: selectedLeft.size === available.length ? "#2563eb" : "#94a3b8",
                        }}>
                        {selectedLeft.size === available.length && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {selectedLeft.size > 0 && selectedLeft.size < available.length && (
                          <div className="w-2 h-0.5 rounded" style={{ background: "#2563eb" }} />
                        )}
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: "#2563eb" }}>
                        {selectedLeft.size === available.length ? "Deselect All" : "Select All"}
                      </span>
                    </button>
                  )}
                </div>
                {available.length === 0 ? (
                  <div className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
                    {orders.length === 0
                      ? <><p className="font-semibold mb-1">No orders yet</p><p>Click "Sync SAP" to load orders from SAP</p></>
                      : <p className="text-green-600 font-semibold">✓ All orders fully paid</p>}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {available.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        selected={selectedLeft.has(o.id)}
                        onToggle={() => setSelectedLeft((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                          return next;
                        })}
                        onDelete={() => handleDeleteOrder(o.id)}
                        side="left"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Center: Move buttons — pinned to top so they stay visible regardless of scroll */}
              <div className="flex flex-col items-center justify-start gap-2 px-2 pt-4 pb-4 sticky top-0"
                style={{ borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
                {/* Mark All Paid shortcut */}
                {available.length > 0 && (
                  <button
                    onClick={async () => {
                      setSaving(true);
                      const allIds = new Set(available.map((o) => o.id));
                      const newAssigned = new Set([...assigned.map((o) => o.id), ...allIds]);
                      await fetch("/api/service-orders", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "assign", gatePassId: pass.id, assignedIds: [...newAssigned] }),
                      });
                      setSelectedLeft(new Set());
                      await fetchOrders();
                      setSaving(false);
                    }}
                    disabled={saving}
                    title="Mark all pending orders as paid at once"
                    className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-[10px] font-bold transition-all disabled:opacity-40"
                    style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    All
                  </button>
                )}
                <button
                  onClick={handleSwitchToAssigned}
                  disabled={saving || selectedLeft.size === 0}
                  title="Mark selected orders as fully paid"
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 whitespace-nowrap"
                  style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Mark Paid
                </button>
                <p className="text-[9px] text-center leading-tight" style={{ color: "var(--text-muted)" }}>
                  Select &amp;<br/>move
                </p>
                <button
                  onClick={handleSwitchToAvailable}
                  disabled={saving || selectedRight.size === 0}
                  title="Move back to pending"
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 whitespace-nowrap"
                  style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                  </svg>
                  Unmark
                </button>
              </div>

              {/* Right: Fully Paid */}
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                  Fully Paid ✓
                  {assigned.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "#f0fdf4", color: "#15803d" }}>
                      {assigned.length}
                    </span>
                  )}
                </p>
                {assigned.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
                    Select orders from left &amp; click Mark Paid
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {assigned.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        selected={selectedRight.has(o.id)}
                        onToggle={() => setSelectedRight((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                          return next;
                        })}
                        onDelete={() => handleDeleteOrder(o.id)}
                        side="right"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex-shrink-0 flex items-center justify-between gap-4"
          style={{ borderColor: "var(--border)" }}>
          <div className="flex-1">
            {error && <p className="text-sm font-medium" style={{ color: "#ef4444" }}>{error}</p>}
            {immediateOrders.length > 0 && (
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>
                  <span className="font-semibold" style={{ color: "#15803d" }}>{assigned.length}</span> immediate paid
                </span>
                <span>·</span>
                <span>
                  <span className="font-semibold" style={{ color: available.length > 0 ? "#c2410c" : "var(--text-muted)" }}>
                    {available.length}
                  </span> unpaid
                </span>
                {available.length === 0 && (
                  <span className="px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: "#f0fdf4", color: "#15803d" }}>
                    All immediate orders cleared ✓
                  </span>
                )}
              </div>
            )}
          </div>
          {(() => {
            // allPaid: all IMMEDIATE orders cleared (credit orders are approver's job)
            const allPaid = immediateOrders.length > 0 && available.length === 0;
            const partial = immediateOrders.length > 0 && available.length > 0 && assigned.length > 0;
            const noOrders = immediateOrders.length === 0;

            // For all-paid case: show Slide to Confirm instead of a regular button
            if (allPaid && !isCustomerDelivery) {
              return saving ? (
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: "linear-gradient(135deg,#059669,#10b981)", opacity: 0.7 }}>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Processing…
                </div>
              ) : (
                <SlideToConfirm onConfirm={handleProceed} disabled={saving} />
              );
            }

            const bg = allPaid || isCustomerDelivery
              ? "linear-gradient(135deg,#059669,#10b981)"
              : "linear-gradient(135deg,#d97706,#b45309)";
            const label = noOrders ? "No Immediate Orders — Proceed"
              : partial ? "Some Unpaid — Proceed Anyway"
              : "Proceed";
            return (
              <button
                onClick={() => setConfirmProceed(true)}
                disabled={saving}
                title={noOrders ? "No immediate orders — proceed with cashier confirmation" : "Confirm and proceed"}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:opacity-90"
                style={{ background: bg, flexShrink: 0 }}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Processing…
                  </>
                ) : (
                  <>
                    {partial && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}
                    {label}
                  </>
                )}
              </button>
            );
          })()}
        </div>

        {/* ── Post-proceed: Receipt / Invoice screen ── */}
        {proceeded && proceededResult && (
          <div className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden"
            style={{ background: "var(--surface)", zIndex: 10 }}>
            {/* Success header */}
            <div className="px-6 py-5 flex items-center gap-4 flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#064e3b,#065f46)" }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-base">Payment Cleared ✓</p>
                <p className="text-green-200 text-xs mt-0.5">
                  {proceededResult.status === "APPROVED"
                    ? "All checks complete — Security Officer notified for Gate Release"
                    : proceededResult.creditPending
                    ? "Immediate orders cleared — credit approval in progress"
                    : "Cashier review complete"}
                </p>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg"
                style={{ background: "rgba(255,255,255,0.15)", color: "#a7f3d0" }}>
                {pass.gatePassNumber}
              </span>
            </div>

            {/* Printable invoice area */}
            <div className="flex-1 overflow-y-auto px-6 py-4" ref={invoiceRef}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Payment Receipt</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{new Date().toLocaleString()}</p>
              </div>

              {/* Vehicle info */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: "Vehicle", value: pass.vehicle },
                  { label: "Chassis", value: pass.chassis ?? "—" },
                  { label: "Gate Pass", value: pass.gatePassNumber },
                  { label: "Pass Type", value: pass.passType.replace(/_/g, " ") },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
                    <p className="text-sm font-semibold font-mono" style={{ color: "var(--text)" }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Orders table — Paid */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#15803d" }}>
                  ✓ Cleared ({snapshotPaidOrders.length})
                </p>
                {snapshotUnpaidOrders.length > 0 && (
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#c2410c" }}>
                    ✗ Unpaid ({snapshotUnpaidOrders.length})
                  </p>
                )}
              </div>
              {[
                { list: snapshotPaidOrders, label: "Cleared", headerBg: "#f0fdf4", headerColor: "#15803d", borderColor: "#bbf7d0", rowBadgeBg: "#f0fdf4", rowBadgeColor: "#15803d" },
                ...(snapshotUnpaidOrders.length > 0 ? [{ list: snapshotUnpaidOrders, label: "Unpaid", headerBg: "#fef2f2", headerColor: "#991b1b", borderColor: "#fecaca", rowBadgeBg: "#fef2f2", rowBadgeColor: "#991b1b" }] : []),
              ].map(({ list, label, headerBg, headerColor, borderColor, rowBadgeBg, rowBadgeColor }) => (
                list.length === 0 ? (
                  <div key={label} className="rounded-xl p-4 text-center text-xs mb-3" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                    No {label.toLowerCase()} orders
                  </div>
                ) : (
                  <div key={label} className="rounded-xl border overflow-hidden mb-3" style={{ borderColor }}>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr style={{ background: headerBg }}>
                          {["#", "Order ID", "Status", "Pay Term"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider"
                              style={{ color: headerColor, borderBottom: `1px solid ${borderColor}`, fontSize: "10px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((o, i) => (
                          <tr key={o.id} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                            <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                            <td className="px-3 py-2.5 font-bold font-mono" style={{ color: "var(--text)" }}>{o.orderId}</td>
                            <td className="px-3 py-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{ background: rowBadgeBg, color: rowBadgeColor }}>{o.orderStatus}</span>
                            </td>
                            <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{o.payTerm}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ))}

              <div className="mt-4 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>
                  ✓ Cleared by Cashier
                </span>
                {proceededResult.creditPending && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                    Credit — Approver in progress
                  </span>
                )}
              </div>
            </div>

            {/* Actions footer */}
            <div className="px-6 py-4 border-t flex items-center gap-3 flex-shrink-0"
              style={{ borderColor: "var(--border)" }}>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Receipt
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </button>
              <div className="flex-1" />
              <button
                onClick={() => onProceed(proceededResult)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow"
                style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}
              >
                Done
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {confirmProceed && (
          <div className="absolute inset-0 flex items-center justify-center p-6"
            style={{ background: "rgba(15, 23, 42, 0.45)" }}>
            <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "#eff6ff", color: "#2563eb" }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>
                    Confirm Proceed
                  </h3>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    {isCustomerDelivery
                      ? "Confirm that payment is cleared and this customer delivery can move to security gate out."
                      : "Confirm the cashier review is complete for this service pass. Remaining credit items, if any, will stay with the approver."}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmProceed(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--surface2)", color: "var(--text-muted)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceed}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                >
                  {saving ? "Processing..." : "Yes, Proceed"}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function OrderCard({
  order, selected, onToggle, onDelete, side,
}: {
  order: ServiceOrder;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  side: "left" | "right";
}) {
  const bg      = side === "right" ? (selected ? "#bbf7d0" : "#f0fdf4") : (selected ? "#dbeafe" : "var(--surface2)");
  const border  = side === "right" ? (selected ? "#86efac" : "#bbf7d0") : (selected ? "#93c5fd" : "var(--border)");

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer"
      style={{ background: bg, borderColor: border }}
      onClick={onToggle}>
      <div className={`w-4 h-4 rounded mt-0.5 flex-shrink-0 border-2 flex items-center justify-center transition-all`}
        style={{
          background: selected ? (side === "right" ? "#15803d" : "#2563eb") : "transparent",
          borderColor: selected ? (side === "right" ? "#15803d" : "#2563eb") : "var(--border)",
        }}>
        {selected && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Order ID: {order.orderId}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: order.orderStatus === "Close" ? "#f0fdf4" : "#fff7ed", color: order.orderStatus === "Close" ? "#15803d" : "#c2410c" }}>
            Status: {order.orderStatus}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Pay Term: {order.payTerm}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 hover:opacity-70 mt-0.5"
        style={{ color: "var(--text-muted)" }}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Quick Invoice Modal (per-card, no review workflow) ────────────────────────

function QuickInvoiceModal({ pass, onClose }: { pass: GatePass; onClose: () => void }) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const immediateTerms = ["immediate", "zc01", "payment immediate", "cash", "pay immediately w/o deduction", ""];

  useEffect(() => {
    fetch(`/api/service-orders?gatePassId=${pass.id}`)
      .then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  }, [pass.id]);

  const paid   = orders.filter(o =>  o.isAssigned && immediateTerms.includes((o.payTerm || "").toLowerCase().trim()));
  const unpaid = orders.filter(o => !o.isAssigned && immediateTerms.includes((o.payTerm || "").toLowerCase().trim()));
  const credit = orders.filter(o => { const t = (o.payTerm || "").toLowerCase().trim(); return t !== "" && !immediateTerms.includes(t); });

  function printInvoice() {
    const el = invoiceRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=820,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice · ${pass.gatePassNumber}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:28px;color:#111;font-size:13px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
      .hdr h1{font-size:20px;font-weight:700}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;background:#f9fafb;padding:12px;border-radius:4px;border:1px solid #e5e7eb}
      .meta strong{display:block;font-size:10px;text-transform:uppercase;color:#6b7280;margin-bottom:2px}h2{font-size:12px;font-weight:700;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.05em}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}th{background:#f3f4f6;font-size:10px;text-transform:uppercase;padding:6px 10px;text-align:left;border:1px solid #e5e7eb}
      td{padding:6px 10px;border:1px solid #e5e7eb;font-size:12px}.footer{margin-top:20px;padding-top:10px;border-top:1px solid #d1d5db;font-size:10px;color:#6b7280}
    </style></head><body>
    <div class="hdr"><div><h1>Payment Invoice</h1><p style="font-size:11px;color:#6b7280;margin-top:3px">DIMO Gate Pass System</p></div>
    <div style="text-align:right"><p style="font-size:18px;font-weight:700;font-family:monospace">${pass.gatePassNumber}</p><p style="font-size:11px;color:#6b7280">${new Date().toLocaleString()}</p></div></div>
    <div class="meta">
      <div><strong>Vehicle</strong>${pass.vehicle}</div><div><strong>Chassis</strong>${pass.chassis ?? "—"}</div>
      <div><strong>Pass Type</strong>${pass.passType.replace(/_/g," ")}</div><div><strong>Requested By</strong>${pass.createdBy.name}</div>
    </div>
    ${paid.length>0?`<h2 style="color:#15803d">✓ Cleared Orders (${paid.length})</h2><table><thead><tr><th>#</th><th>Order ID</th><th>Status</th><th>Pay Term</th></tr></thead><tbody>${paid.map((o,i)=>`<tr><td>${i+1}</td><td><b>${o.orderId}</b></td><td>${o.orderStatus}</td><td>${o.payTerm}</td></tr>`).join("")}</tbody></table>`:""}
    ${unpaid.length>0?`<h2 style="color:#991b1b">✗ Unpaid Orders (${unpaid.length})</h2><table><thead><tr><th>#</th><th>Order ID</th><th>Status</th><th>Pay Term</th></tr></thead><tbody>${unpaid.map((o,i)=>`<tr style="background:#fef2f2"><td>${i+1}</td><td><b>${o.orderId}</b></td><td>${o.orderStatus}</td><td>${o.payTerm}</td></tr>`).join("")}</tbody></table>`:""}
    ${credit.length>0?`<h2 style="color:#1d4ed8">Credit Orders — handled by Approver (${credit.length})</h2><table><thead><tr><th>#</th><th>Order ID</th><th>Status</th><th>Pay Term</th></tr></thead><tbody>${credit.map((o,i)=>`<tr style="background:#eff6ff"><td>${i+1}</td><td><b>${o.orderId}</b></td><td>${o.orderStatus}</td><td>${o.payTerm}</td></tr>`).join("")}</tbody></table>`:""}
    <div class="footer">Generated by DIMO Gate Pass System · ${new Date().toLocaleString()}</div>
    </body></html>`);
    win.document.close(); win.focus(); win.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <motion.div className="relative w-full max-w-xl rounded-2xl shadow-2xl flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "85vh" }}
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
              Invoice · <span className="font-mono" style={{ color: "var(--accent)" }}>{pass.gatePassNumber}</span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{pass.vehicle}{pass.chassis ? ` · ${pass.chassis}` : ""}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ background: "var(--surface2)" }}>
            <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4" ref={invoiceRef}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin w-6 h-6" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : (
            <>
              {/* Summary chips */}
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "#f0fdf4", color: "#15803d" }}>✓ {paid.length} Cleared</span>
                {unpaid.length > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "#fef2f2", color: "#991b1b" }}>✗ {unpaid.length} Unpaid</span>}
                {credit.length > 0 && <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>{credit.length} Credit (Approver)</span>}
              </div>

              {/* Order sections */}
              {[
                { list: paid,   label: "Cleared Orders",                  bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
                { list: unpaid, label: "Unpaid Orders",                   bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
                { list: credit, label: "Credit Orders (handled by Approver)", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
              ].map(({ list, label, bg, color, border }) => list.length === 0 ? null : (
                <div key={label} className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color }}>{label} ({list.length})</p>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
                    <table className="w-full text-xs border-collapse">
                      <thead><tr style={{ background: bg }}>
                        {["#","Order ID","Status","Pay Term"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-bold" style={{ color, borderBottom: `1px solid ${border}`, fontSize: "10px", textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>{list.map((o, i) => (
                        <tr key={o.id} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                          <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i+1}</td>
                          <td className="px-3 py-2 font-bold font-mono" style={{ color: "var(--text)" }}>{o.orderId}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: bg, color }}>{o.orderStatus}</span></td>
                          <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{o.payTerm}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No orders found for this vehicle</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center gap-3 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <button onClick={printInvoice} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:opacity-80 disabled:opacity-50"
            style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
          <button onClick={printInvoice} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:opacity-80 disabled:opacity-50"
            style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>Close</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Cashier Review Page ──────────────────────────────────────────────────

export default function CashierReviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [passes, setPasses] = useState<GatePass[]>([]);
  const [cdPasses, setCdPasses] = useState<GatePass[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalPass, setModalPass] = useState<GatePass | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "info" } | null>(null);
  const [activeTab, setActiveTab] = useState<"AFTER_SALES" | "CUSTOMER_DELIVERY" | "CLEARED">("AFTER_SALES");
  const [search, setSearch] = useState("");
  const [quickInvoicePass, setQuickInvoicePass] = useState<GatePass | null>(null);
  const [clearedPasses, setClearedPasses] = useState<GatePass[]>([]);
  const [clearedSearch, setClearedSearch] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, { orders: ServiceOrder[]; loading: boolean }>>({});
  const [overrideLoadingId, setOverrideLoadingId] = useState<string | null>(null);

  // All hooks must be declared before any conditional returns
  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const [asRes, cdRes, clearedRes] = await Promise.all([
        fetch("/api/gate-pass?status=CASHIER_REVIEW&passType=AFTER_SALES&limit=50&cashierPending=true"),
        fetch("/api/gate-pass?status=CASHIER_REVIEW&passType=CUSTOMER_DELIVERY&limit=50"),
        fetch("/api/gate-pass?cashierCleared=true&limit=100"),
      ]);
      const asData = await asRes.json();
      const cdData = await cdRes.json();
      const clearedData = await clearedRes.json();
      const asPasses: GatePass[] = asData.passes ?? [];
      const cdFiltered: GatePass[] = (cdData.passes ?? []).filter((p: GatePass) => p.hasImmediate && !p.cashierCleared);
      setPasses(asPasses);
      setCdPasses(cdFiltered);
      setClearedPasses(clearedData.passes ?? []);
      setTotal((asData.total ?? 0) + cdFiltered.length);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void fetchPasses(); }, [fetchPasses]);

  useEffect(() => {
    if (status !== "loading" && (!session || session.user?.role !== "CASHIER")) {
      router.replace("/");
    }
  }, [status, session, router]);

  if (status === "loading") return null;
  if (!session || session.user?.role !== "CASHIER") return null;

  function showToast(text: string, type: "success" | "info" = "success") {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  }

  function handleProceedResult(result: { status: string; creditPending?: boolean }) {
    setModalPass(null);
    if (result.status === "APPROVED") {
      showToast("All checks complete — Security Officer notified for Gate Release.", "success");
    } else if (result.creditPending) {
      showToast("Immediate orders cleared — waiting for credit approval.", "info");
    } else {
      showToast("Payment cleared — awaiting further processing.", "info");
    }
    void fetchPasses();
  }

  async function handleRequestOverride(passId: string) {
    if (!confirm("Request payment override from your assigned approver? They will be notified to approve Gate OUT without full payment clearance.")) return;
    setOverrideLoadingId(passId);
    try {
      const res = await fetch(`/api/gate-pass/${passId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashier_override_request" }),
      });
      if (res.ok) {
        showToast("Override requested — your approver has been notified.", "info");
        void fetchPasses();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Failed: ${err.error || "Please try again."}`, "info");
      }
    } catch {
      showToast("Network error — please try again.", "info");
    } finally {
      setOverrideLoadingId(null);
    }
  }

  const asCount = passes.length;
  const cdCount = cdPasses.length;

  return (
    <div className="flex flex-col gap-0">
      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2"
            style={{
              background: toastMsg.type === "success" ? "#f0fdf4" : "#eff6ff",
              color:      toastMsg.type === "success" ? "#15803d" : "#1d4ed8",
              border: `1px solid ${toastMsg.type === "success" ? "#bbf7d0" : "#bfdbfe"}`,
            }}
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {toastMsg.type === "success"
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              }
            </svg>
            {toastMsg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Payment Review</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Clear payments and confirm gate release readiness
          </p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <div className="px-3 py-1.5 rounded-xl text-sm font-semibold"
              style={{ background: "#fef3c7", color: "#b45309" }}>
              {total} pending
            </div>
          )}
          <button onClick={() => void fetchPasses()}
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          { key: "AFTER_SALES",       label: "Service / Repair",  count: asCount,              icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
          { key: "CUSTOMER_DELIVERY", label: "Customer Delivery", count: cdCount,              icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
          { key: "CLEARED",           label: "Cleared History",   count: clearedPasses.length, icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
        ] as const).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={active
                ? { background: "linear-gradient(135deg,#1a4f9e,#2563eb)", color: "#fff" }
                : { background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)" }
              }
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
              {tab.count > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                  style={active
                    ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                    : { background: "#ef4444", color: "#fff" }
                  }
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search bar — only for pending tabs */}
      {activeTab !== "CLEARED" && <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by vehicle, chassis or GP number…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        {search && (
          <button onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: "var(--text-muted)" }}>✕</button>
        )}
      </div>}

      {/* Scrollable list */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <svg className="animate-spin w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>

        ) : activeTab === "AFTER_SALES" ? (
          /* ── After Sales tab ── */
          passes.length === 0 ? (
            <EmptyState icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" title="All clear!" sub="No service passes awaiting order review" />
          ) : (
            <>
              <div className="rounded-2xl border px-4 py-3 mb-3 flex items-center gap-2.5"
                style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs" style={{ color: "#1d4ed8" }}>
                  Open a pass → assign fully-paid orders → <strong>Proceed</strong>. Uncleared orders escalate to Approver.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {passes.filter(p => !search || [p.vehicle, p.chassis, p.gatePassNumber].some(v => v?.toLowerCase().includes(search.toLowerCase()))).map((p, i) => (
                  <motion.div key={p.id}
                    className="rounded-2xl border p-4 flex items-center gap-4"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  >
                    {/* Icon + GP number */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "#fef3c7" }}>
                      <svg className="w-5 h-5" style={{ color: "#b45309" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/gate-pass/${p.id}`} className="text-sm font-bold font-mono hover:underline" style={{ color: "var(--accent)" }}>
                          {p.gatePassNumber}
                        </Link>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>
                          Awaiting Review
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <p className="text-sm font-semibold font-mono" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                        {p.chassis && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                        {(p.serviceJobNo || p.parentPass?.serviceJobNo) && (
                          <span className="text-xs font-semibold" style={{ color: "#b45309" }}>
                            Job: {p.serviceJobNo ?? p.parentPass?.serviceJobNo}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(p.createdAt)} · {p.createdBy.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setQuickInvoicePass(p)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                        title="View & print invoice"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Invoice
                      </button>
                      <button
                        onClick={() => setModalPass(p)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm transition-all hover:opacity-90"
                        style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Review Orders
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )

        ) : activeTab === "CUSTOMER_DELIVERY" ? (
          /* ── Customer Delivery tab ── */
          cdPasses.length === 0 ? (
            <EmptyState icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" title="All clear!" sub="No Customer Delivery passes awaiting payment clearance" />
          ) : (
            <>
              <div className="rounded-2xl border px-4 py-3 mb-3 flex items-center gap-2.5"
                style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs" style={{ color: "#15803d" }}>
                  Open a pass to review SAP orders, confirm payment, and proceed to Gate OUT clearance.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {cdPasses.filter(p => !search || [p.vehicle, p.chassis, p.gatePassNumber].some(v => v?.toLowerCase().includes(search.toLowerCase()))).map((p, i) => (
                  <motion.div key={p.id}
                    className="rounded-2xl border p-4 flex items-center gap-4"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  >
                    {/* Icon */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "#fef3c7" }}>
                      <svg className="w-5 h-5" style={{ color: "#b45309" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/gate-pass/${p.id}`} className="text-sm font-bold font-mono hover:underline" style={{ color: "var(--accent)" }}>
                          {p.gatePassNumber}
                        </Link>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#fef3c7", color: "#b45309" }}>
                          Awaiting Review
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <p className="text-sm font-semibold font-mono" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                        {p.chassis && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(p.createdAt)} · {p.createdBy.name}</span>
                      </div>
                    </div>

                    {/* Invoice + Review Orders + Override */}
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => setQuickInvoicePass(p)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                        title="View & print invoice"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Invoice
                      </button>
                      {p.cashierOverrideRequested ? (
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                          style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Awaiting Approver Override
                        </span>
                      ) : (
                        <button
                          onClick={() => void handleRequestOverride(p.id)}
                          disabled={overrideLoadingId === p.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-80 disabled:opacity-50"
                          style={{ background: "#fff7ed", borderColor: "#fdba74", color: "#c2410c" }}
                          title="Request approver override for payment clearance"
                        >
                          {overrideLoadingId === p.id
                            ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                          Request Override
                        </button>
                      )}
                      <button
                        onClick={() => setModalPass(p)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm transition-all hover:opacity-90"
                        style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Review Orders
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )
        ) : (
          /* ── Cleared History tab ── */
          <>
            {/* Search for cleared vehicles */}
            <div className="relative mb-4">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" value={clearedSearch}
                onChange={e => setClearedSearch(e.target.value)}
                placeholder="Search by vehicle number, chassis or GP number…"
                className="w-full pl-10 pr-9 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              {clearedSearch && (
                <button onClick={() => setClearedSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
              )}
            </div>

            {clearedPasses.filter(p =>
              !clearedSearch || [p.vehicle, p.chassis, p.gatePassNumber].some(v => v?.toLowerCase().includes(clearedSearch.toLowerCase()))
            ).length === 0 ? (
              <EmptyState icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" title="No cleared passes" sub={clearedSearch ? "No results match your search" : "No passes have been cleared yet"} />
            ) : (
              <div className="flex flex-col gap-3">
                {clearedPasses
                  .filter(p => !clearedSearch || [p.vehicle, p.chassis, p.gatePassNumber].some(v => v?.toLowerCase().includes(clearedSearch.toLowerCase())))
                  .map((p, i) => {
                    const exp = expandedOrders[p.id];
                    const isExpanded = !!exp;
                    return (
                      <motion.div key={p.id}
                        className="rounded-2xl border overflow-hidden"
                        style={{ background: "var(--surface)", borderColor: "#bbf7d0" }}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      >
                        {/* Card header */}
                        <div className="p-4 flex items-center gap-4">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#f0fdf4" }}>
                            <svg className="w-5 h-5" style={{ color: "#15803d" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link href={`/gate-pass/${p.id}`} className="text-sm font-bold font-mono hover:underline" style={{ color: "var(--accent)" }}>{p.gatePassNumber}</Link>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#f0fdf4", color: "#15803d" }}>✓ Cleared</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                                {p.passType.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <p className="text-sm font-semibold font-mono" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                              {p.chassis && <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(p.createdAt)} · {p.createdBy.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => setQuickInvoicePass(p)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                              style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Invoice
                            </button>
                            <button
                              onClick={async () => {
                                if (isExpanded) { setExpandedOrders(prev => { const n = {...prev}; delete n[p.id]; return n; }); return; }
                                setExpandedOrders(prev => ({ ...prev, [p.id]: { orders: [], loading: true } }));
                                const res = await fetch(`/api/service-orders?gatePassId=${p.id}`);
                                const d = await res.json();
                                setExpandedOrders(prev => ({ ...prev, [p.id]: { orders: d.orders ?? [], loading: false } }));
                              }}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                              style={{ background: isExpanded ? "#f0fdf4" : "var(--surface2)", borderColor: isExpanded ? "#bbf7d0" : "var(--border)", color: isExpanded ? "#15803d" : "var(--text-muted)" }}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                              </svg>
                              Orders
                            </button>
                          </div>
                        </div>

                        {/* Expandable orders */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ borderTop: "1px solid #bbf7d0", background: "#f0fdf4", overflow: "hidden" }}
                            >
                              {exp.loading ? (
                                <div className="flex items-center justify-center py-6 gap-2">
                                  <svg className="animate-spin w-4 h-4" style={{ color: "#15803d" }} fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                  <span className="text-xs" style={{ color: "#15803d" }}>Loading orders…</span>
                                </div>
                              ) : exp.orders.length === 0 ? (
                                <p className="text-xs text-center py-5" style={{ color: "#15803d" }}>No orders found for this vehicle</p>
                              ) : (
                                <div className="px-4 py-3">
                                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <p className="text-xs font-bold" style={{ color: "#15803d" }}>
                                      {exp.orders.length} order{exp.orders.length !== 1 ? "s" : ""} total
                                    </p>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#dcfce7", color: "#15803d" }}>
                                      {exp.orders.filter(o => o.isAssigned).length} cleared
                                    </span>
                                    {exp.orders.filter(o => !o.isAssigned).length > 0 && (
                                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#fef2f2", color: "#991b1b" }}>
                                        {exp.orders.filter(o => !o.isAssigned).length} unpaid
                                      </span>
                                    )}
                                  </div>
                                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#bbf7d0" }}>
                                    <table className="w-full text-xs border-collapse">
                                      <thead>
                                        <tr style={{ background: "#dcfce7" }}>
                                          {["#", "Order ID", "Status", "Pay Term", "Payment"].map(h => (
                                            <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider"
                                              style={{ color: "#15803d", borderBottom: "1px solid #bbf7d0", fontSize: "10px" }}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {exp.orders.map((o, idx) => (
                                          <tr key={o.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f0fdf4", borderBottom: "1px solid #bbf7d0" }}>
                                            <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-muted)" }}>{idx + 1}</td>
                                            <td className="px-3 py-2.5 font-bold font-mono" style={{ color: "var(--text)" }}>{o.orderId}</td>
                                            <td className="px-3 py-2.5">
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                                style={{ background: o.orderStatus?.toLowerCase().includes("close") ? "#f0fdf4" : "#fff7ed", color: o.orderStatus?.toLowerCase().includes("close") ? "#15803d" : "#c2410c" }}>
                                                {o.orderStatus}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{o.payTerm}</td>
                                            <td className="px-3 py-2.5">
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                                style={{ background: o.isAssigned ? "#dcfce7" : "#fef2f2", color: o.isAssigned ? "#15803d" : "#991b1b" }}>
                                                {o.isAssigned ? "✓ Cleared" : "Unpaid"}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Order modal */}
      <AnimatePresence>
        {modalPass && (
          <OrderModal
            pass={modalPass}
            onClose={() => setModalPass(null)}
            onProceed={handleProceedResult}
          />
        )}
      </AnimatePresence>

      {/* Quick Invoice modal */}
      <AnimatePresence>
        {quickInvoicePass && (
          <QuickInvoiceModal
            pass={quickInvoicePass}
            onClose={() => setQuickInvoicePass(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <svg className="w-10 h-10" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold" style={{ color: "var(--text)" }}>{title}</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>
      </div>
    </div>
  );
}
