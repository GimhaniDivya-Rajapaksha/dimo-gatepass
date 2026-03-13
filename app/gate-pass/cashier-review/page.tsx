"use client";
import { useState, useEffect, useCallback } from "react";
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

// ── Order Assignment Modal ────────────────────────────────────────────────────

function OrderModal({
  pass,
  onClose,
  onProceed,
}: {
  pass: GatePass;
  onClose: () => void;
  onProceed: (result: "COMPLETED" | "PENDING_APPROVAL") => void;
}) {
  const jobNo = pass.serviceJobNo ?? pass.parentPass?.serviceJobNo ?? pass.gatePassNumber;

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New order form
  const [newOrderId, setNewOrderId] = useState("");
  const [newOrderStatus, setNewOrderStatus] = useState("Open");
  const [newPayTerm, setNewPayTerm] = useState("Immediate");
  const [addingOrder, setAddingOrder] = useState(false);

  // Selected checkboxes on the left (available) side
  const [selectedLeft, setSelectedLeft] = useState<Set<string>>(new Set());
  // Selected checkboxes on the right (assigned) side
  const [selectedRight, setSelectedRight] = useState<Set<string>>(new Set());

  const available = orders.filter((o) => !o.isAssigned);
  const assigned   = orders.filter((o) => o.isAssigned);

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

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

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
    if (orders.length === 0) { setError("Please add at least one order before proceeding."); return; }
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
      onProceed(d.status as "COMPLETED" | "PENDING_APPROVAL");
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
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ background: "var(--surface2)" }}>
            <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Add order row */}
        <div className="px-6 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newOrderId}
              onChange={(e) => setNewOrderId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddOrder()}
              placeholder="Order ID (e.g. 293084)"
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <select value={newOrderStatus} onChange={(e) => setNewOrderStatus(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="Open">Open</option>
              <option value="Close">Close</option>
            </select>
            <select value={newPayTerm} onChange={(e) => setNewPayTerm(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="Immediate">Immediate</option>
              <option value="Credit">Credit</option>
              <option value="Partial">Partial</option>
            </select>
            <button onClick={handleAddOrder} disabled={addingOrder || !newOrderId.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)" }}>
              {addingOrder ? "Adding…" : "+ Add"}
            </button>
          </div>
        </div>

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
              {/* Left: Available Orders */}
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                  Available Orders
                  {available.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "#fef2f2", color: "#991b1b" }}>
                      {available.length}
                    </span>
                  )}
                </p>
                {available.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
                    {orders.length === 0 ? "No orders added yet" : "All orders assigned"}
                  </p>
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

              {/* Center: Switch button */}
              <div className="flex flex-col items-center justify-center gap-2 px-2 py-4"
                style={{ borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
                <button
                  onClick={handleSwitchToAssigned}
                  disabled={saving || selectedLeft.size === 0}
                  title="Move selected to Assigned"
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                  style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Assign
                </button>
                <button
                  onClick={handleSwitchToAvailable}
                  disabled={saving || selectedRight.size === 0}
                  title="Move selected back to Available"
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                  style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                  </svg>
                  Return
                </button>
              </div>

              {/* Right: Assigned */}
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                  Assigned (Fully Paid)
                  {assigned.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "#f0fdf4", color: "#15803d" }}>
                      {assigned.length}
                    </span>
                  )}
                </p>
                {assigned.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>No orders assigned</p>
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
            {orders.length > 0 && (
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>
                  <span className="font-semibold" style={{ color: "#15803d" }}>{assigned.length}</span> fully paid
                </span>
                <span>·</span>
                <span>
                  <span className="font-semibold" style={{ color: available.length > 0 ? "#c2410c" : "var(--text-muted)" }}>
                    {available.length}
                  </span> pending payment
                </span>
                {available.length === 0 && assigned.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: "#f0fdf4", color: "#15803d" }}>
                    All paid — ready to complete ✓
                  </span>
                )}
                {available.length > 0 && assigned.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: "#fff7ed", color: "#c2410c" }}>
                    Partial payment — will go to Approver
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleProceed}
            disabled={saving || orders.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#1a4f9e,#2563eb)", flexShrink: 0 }}
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Processing…
              </>
            ) : "Proceed"}
          </button>
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalPass, setModalPass] = useState<GatePass | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "info" } | null>(null);

  if (status === "loading") return null;
  if (!session || session.user?.role !== "CASHIER") {
    router.replace("/");
    return null;
  }

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gate-pass?status=CASHIER_REVIEW&passType=AFTER_SALES&limit=50");
      const d = await res.json();
      setPasses(d.passes ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void fetchPasses(); }, [fetchPasses]);

  function showToast(text: string, type: "success" | "info" = "success") {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  }

  function handleProceedResult(result: "COMPLETED" | "PENDING_APPROVAL") {
    setModalPass(null);
    if (result === "GATE_OUT" as string || result === "COMPLETED") {
      showToast("All orders paid — vehicle cleared for Gate Out. Awaiting final confirmation.", "success");
    } else {
      showToast("Partial payment — sent to Approver for review.", "info");
    }
    void fetchPasses();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
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
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
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
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Order Review</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Review service orders and mark jobs as complete or escalate to approver
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl text-sm font-semibold"
            style={{ background: "#fef3c7", color: "#b45309" }}>
            {total} pending review
          </div>
          <button onClick={() => void fetchPasses()}
            className="w-9 h-9 rounded-xl border flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Instructions banner */}
      <div className="rounded-2xl border px-5 py-3 mb-4 flex items-start gap-3 flex-shrink-0"
        style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#2563eb" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm" style={{ color: "#1d4ed8" }}>
          <span className="font-semibold">How it works: </span>
          Open a pass → add the service orders → move fully-paid orders to <strong>Assigned</strong> →
          click <strong>Proceed</strong>. If all are assigned → job is <strong>Completed</strong>.
          If some remain → sent to <strong>Approver</strong> for partial payment approval.
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        ) : passes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <svg className="w-10 h-10" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold" style={{ color: "var(--text)" }}>All clear!</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>No passes waiting for order review</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {passes.map((p, i) => (
              <motion.div
                key={p.id}
                className="rounded-2xl border p-5 flex items-center gap-5"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                {/* Left: pass info */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "#fef3c7" }}>
                    <svg className="w-5 h-5" style={{ color: "#b45309" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <Link href={`/gate-pass/${p.id}`}
                      className="text-sm font-bold font-mono hover:underline"
                      style={{ color: "var(--accent)" }}>
                      {p.gatePassNumber}
                    </Link>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {fmtDate(p.createdAt)} · {p.createdBy.name}
                    </p>
                  </div>
                </div>

                <div className="w-px h-10 flex-shrink-0" style={{ background: "var(--border)" }} />

                {/* Vehicle */}
                <div className="flex-shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Vehicle</p>
                  <p className="text-sm font-bold font-mono" style={{ color: "var(--text)" }}>{p.vehicle}</p>
                  {p.chassis && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.chassis}</p>}
                </div>

                <div className="w-px h-10 flex-shrink-0" style={{ background: "var(--border)" }} />

                {/* Journey */}
                <div className="flex-shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Main OUT from</p>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span style={{ color: "var(--text)" }}>{p.fromLocation || "—"}</span>
                    <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <span className="font-medium" style={{ color: "var(--accent)" }}>{p.toLocation || "—"}</span>
                  </div>
                </div>

                {/* Service Job No */}
                {(p.serviceJobNo || p.parentPass?.serviceJobNo) && (
                  <>
                    <div className="w-px h-10 flex-shrink-0" style={{ background: "var(--border)" }} />
                    <div className="flex-shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Job No</p>
                      <p className="text-sm font-mono font-bold" style={{ color: "#b45309" }}>
                        {p.serviceJobNo ?? p.parentPass?.serviceJobNo}
                      </p>
                    </div>
                  </>
                )}

                <div className="flex-1" />

                {/* Cashier Review badge */}
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0"
                  style={{ background: "#fef3c7", color: "#b45309" }}>
                  Awaiting Review
                </span>

                {/* Review button */}
                <button
                  onClick={() => setModalPass(p)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow transition-all hover:opacity-90 flex-shrink-0"
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
