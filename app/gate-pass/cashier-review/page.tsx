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

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sapSyncing, setSapSyncing] = useState(false);
  const [sapSyncMsg, setSapSyncMsg] = useState<string | null>(null);

  // New order form
  const [newOrderId, setNewOrderId] = useState("");
  const [newOrderStatus, setNewOrderStatus] = useState("Open");
  const [newPayTerm, setNewPayTerm] = useState("Immediate");
  const [addingOrder, setAddingOrder] = useState(false);

  // Selected checkboxes on the left (available) side
  const [selectedLeft, setSelectedLeft] = useState<Set<string>>(new Set());
  // Selected checkboxes on the right (assigned) side
  const [selectedRight, setSelectedRight] = useState<Set<string>>(new Set());

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

  async function handleAddOrder() {
    if (!newOrderId.trim()) return;
    setAddingOrder(true);
    try {
      const res = await fetch("/api/service-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatePassId: pass.id,
          orderId: newOrderId.trim(),
          orderStatus: newOrderStatus,
          payTerm: newPayTerm,
        }),
      });
      if (!res.ok) { setError("Failed to add order"); return; }
      setNewOrderId("");
      setNewOrderStatus("Open");
      setNewPayTerm("Immediate");
      await fetchOrders();
    } finally {
      setAddingOrder(false);
    }
  }

  async function handleDeleteOrder(id: string) {
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
      const res = await fetch("/api/service-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "proceed", gatePassId: pass.id }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed to proceed"); return; }
      onProceed({ status: d.status, creditPending: d.creditPending });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}>
      <motion.div
        className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
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
              Select{" "}
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
            { n: "3", text: available.length === 0 && immediateOrders.length > 0 ? "Slide to confirm — your part is done ✓" : "Credit orders are handled by Approver in parallel", done: false },
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
              <strong>{creditOrders.length} credit order{creditOrders.length > 1 ? "s" : ""}</strong> (e.g. 90 Days) are being reviewed by the <strong>Approver in parallel</strong> — not your responsibility.
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
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                  Pending Payment
                  {available.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "#fef2f2", color: "#991b1b" }}>
                      {available.length} unpaid
                    </span>
                  )}
                </p>
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

              {/* Center: Move buttons */}
              <div className="flex flex-col items-center justify-center gap-2 px-2 py-4"
                style={{ borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
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
            if (allPaid) {
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

            const bg = noOrders ? "linear-gradient(135deg,#d97706,#b45309)" : "linear-gradient(135deg,#d97706,#b45309)";
            const label = noOrders ? "No Immediate Orders — Mark Done"
              : partial ? "Some Unpaid — Mark Done Anyway"
              : "Proceed";
            return (
              <button
                onClick={handleProceed}
                disabled={saving}
                title={noOrders ? "No immediate orders — mark cashier part as done" : "Mark remaining as done and proceed"}
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

// ── Main Cashier Review Page ──────────────────────────────────────────────────

export default function CashierReviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [passes, setPasses] = useState<GatePass[]>([]);
  const [cdPasses, setCdPasses] = useState<GatePass[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalPass, setModalPass] = useState<GatePass | null>(null);
  const [clearingCdId, setClearingCdId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "info" } | null>(null);
  const [activeTab, setActiveTab] = useState<"AFTER_SALES" | "CUSTOMER_DELIVERY">("AFTER_SALES");

  // All hooks must be declared before any conditional returns
  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const [asRes, cdRes] = await Promise.all([
        fetch("/api/gate-pass?status=CASHIER_REVIEW&passType=AFTER_SALES&limit=50&cashierPending=true"),
        fetch("/api/gate-pass?status=CASHIER_REVIEW&passType=CUSTOMER_DELIVERY&limit=50"),
      ]);
      const asData = await asRes.json();
      const cdData = await cdRes.json();
      const asPasses: GatePass[] = asData.passes ?? [];
      const cdFiltered: GatePass[] = (cdData.passes ?? []).filter((p: GatePass) => p.hasImmediate && !p.cashierCleared);
      setPasses(asPasses);
      setCdPasses(cdFiltered);
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

  async function handleClearCd(passId: string) {
    setClearingCdId(passId);
    try {
      const res = await fetch(`/api/gate-pass/${passId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashier_clear_cd" }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? "Failed to clear payment", "info"); return; }
      showToast("Payment cleared — Security Officer notified for Gate OUT.", "success");
      void fetchPasses();
    } catch {
      showToast("Network error", "info");
    } finally {
      setClearingCdId(null);
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
      <div className="flex gap-2 mb-4">
        {([
          { key: "AFTER_SALES",       label: "Service / Repair",     count: asCount, icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
          { key: "CUSTOMER_DELIVERY", label: "Customer Delivery",    count: cdCount, icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
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
                {passes.map((p, i) => (
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

                    <button
                      onClick={() => setModalPass(p)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm transition-all hover:opacity-90 flex-shrink-0"
                      style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Review Orders
                    </button>
                  </motion.div>
                ))}
              </div>
            </>
          )

        ) : (
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
                  Confirm customer has paid in full before releasing the vehicle for Gate OUT.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {cdPasses.map((p, i) => (
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

                    {/* Confirm Payment Cleared */}
                    <button
                      onClick={() => void handleClearCd(p.id)}
                      disabled={clearingCdId === p.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm transition-all hover:opacity-90 disabled:opacity-60 flex-shrink-0"
                      style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}
                    >
                      {clearingCdId === p.id
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      }
                      {clearingCdId === p.id ? "Processing…" : "Confirm Payment Cleared"}
                    </button>
                  </motion.div>
                ))}
              </div>
            </>
          )
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
