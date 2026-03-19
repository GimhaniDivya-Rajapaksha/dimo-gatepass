"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

type TabKey = "LT_OUT" | "LT_IN";

type GatePass = {
  id: string;
  gatePassNumber: string;
  passType: string;
  status: string;
  vehicle: string;
  chassis: string | null;
  make: string | null;
  vehicleColor: string | null;
  toLocation: string | null;
  outReason: string | null;
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  transportMode: string | null;
  driverName: string | null;
  companyName: string | null;
  comments: string | null;
  createdBy: { name: string };
  approvedBy: { name: string } | null;
  createdAt: string;
};

const TABS: { key: TabKey; label: string; passType: string; passSubType?: string; direction: "OUT" | "IN" }[] = [
  { key: "LT_OUT", label: "Location Transfer OUT", passType: "LOCATION_TRANSFER", direction: "OUT" },
  { key: "LT_IN",  label: "Location Transfer IN",  passType: "LOCATION_TRANSFER", direction: "IN"  },
];

const tabColors: Record<TabKey, { active: string; badge: string; badgeTxt: string }> = {
  LT_OUT: { active: "linear-gradient(135deg,#1a4f9e,#2563eb)", badge: "#dbeafe", badgeTxt: "#1d4ed8" },
  LT_IN:  { active: "linear-gradient(135deg,#065f46,#059669)",  badge: "#d1fae5", badgeTxt: "#065f46" },
};

export default function ReceivePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabKey>("LT_OUT");
  const [pending, setPending]     = useState<GatePass[]>([]);
  const [completed, setCompleted] = useState<GatePass[]>([]);
  const [loading, setLoading]     = useState(true);
  const [updatedChassis, setUpdatedChassis] = useState<Record<string, string>>({});
  const [acknowledging, setAcknowledging]   = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "RECIPIENT") {
      router.replace("/");
    }
  }, [status, session, router]);

  const tab = TABS.find(t => t.key === activeTab)!;

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const subTypeParam = tab.passSubType ? `&passSubType=${tab.passSubType}` : "";
      const [pendingRes, completedRes] = await Promise.all([
        fetch(`/api/gate-pass?passType=${tab.passType}&status=GATE_OUT&limit=50${subTypeParam}`),
        fetch(`/api/gate-pass?passType=${tab.passType}&status=COMPLETED&limit=20${subTypeParam}`),
      ]);
      if (pendingRes.ok)   setPending((await pendingRes.json()).passes ?? []);
      if (completedRes.ok) setCompleted((await completedRes.json()).passes ?? []);
    } finally {
      setLoading(false);
    }
  }, [tab.passType, tab.passSubType]);

  useEffect(() => {
    if (status === "authenticated") fetchPasses();
  }, [status, fetchPasses]);

  if (status === "loading") return null;

  const handleAcknowledge = async (id: string) => {
    setAcknowledging(id);
    try {
      const res = await fetch(`/api/gate-pass/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gate_in",
          receivedChassis: updatedChassis[id] || undefined,
        }),
      });
      if (res.ok) {
        // Move pass from pending → completed
        const moved = pending.find(p => p.id === id);
        if (moved) {
          setPending(prev => prev.filter(p => p.id !== id));
          setCompleted(prev => [{ ...moved, status: "COMPLETED" }, ...prev]);
          setUpdatedChassis(prev => { const n = { ...prev }; delete n[id]; return n; });
        }
      }
    } finally {
      setAcknowledging(null);
    }
  };

  const actionLabel: Record<TabKey, string> = {
    LT_OUT:      "Confirm Gate Out",
    LT_IN:       "Confirm Gate In",
    CD_OUT:      "Confirm Delivery",
    SR_MAIN_IN:  "Confirm Gate Pass IN",
    SR_SUB_OUT:  "Confirm Sub Gate OUT",
    SR_SUB_IN:   "Confirm Sub Gate IN",
    SR_MAIN_OUT: "Confirm Main Gate OUT",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          <span className="font-normal">Recipient</span> Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Acknowledge vehicle gate movements
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Non-SR tabs */}
        {TABS.filter(t => !t.key.startsWith("SR_")).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all"
            style={activeTab === t.key
              ? { background: tabColors[t.key].active, color: "#fff", border: "none" }
              : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
            }
          >
            {t.label}
            {activeTab === t.key && pending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-white/25">
                {pending.length}
              </span>
            )}
          </button>
        ))}
        {/* SR group */}
        <div className="w-full mt-1 mb-1">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Service / Repair</p>
        </div>
        {TABS.filter(t => t.key.startsWith("SR_")).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all"
            style={activeTab === t.key
              ? { background: tabColors[t.key].active, color: "#fff", border: "none" }
              : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
            }
          >
            {t.label.replace("SR — ", "")}
            {activeTab === t.key && pending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-white/25">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* Pending section */}
          {loading ? (
            <div className="space-y-4 mb-8">
              {[1, 2].map(i => (
                <div key={i} className="rounded-2xl border p-6 animate-pulse" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="h-5 rounded w-32 mb-4" style={{ background: "var(--border)" }} />
                  <div className="grid grid-cols-3 gap-4">
                    {[1,2,3].map(j => <div key={j} className="h-4 rounded" style={{ background: "var(--border)" }} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 rounded-2xl border mb-8"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <svg className="w-10 h-10 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No pending acknowledgements</p>
            </div>
          ) : (
            <div className="space-y-4 mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                Awaiting Acknowledgement ({pending.length})
              </p>
              {pending.map((gp, i) => (
                <motion.div
                  key={gp.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl border overflow-hidden"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="h-1 w-full" style={{ background: tabColors[activeTab].active }} />
                  <div className="p-6">
                    {/* Top row */}
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg font-mono" style={{ color: "var(--accent)" }}>
                          {gp.gatePassNumber}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: tabColors[activeTab].badge, color: tabColors[activeTab].badgeTxt }}>
                          Gate Out
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        By {gp.createdBy.name}
                      </span>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-xl p-4 mb-5"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Vehicle</p>
                        <p className="text-sm font-semibold font-mono" style={{ color: "var(--text)" }}>{gp.vehicle}</p>
                        {gp.chassis && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{gp.chassis}</p>}
                      </div>
                      {gp.make && (
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Make</p>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.make}</p>
                        </div>
                      )}
                      {activeTab !== "LT_IN" ? (
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Departure</p>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {gp.departureDate || "—"} {gp.departureTime || ""}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Expected Arrival</p>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {gp.arrivalDate || "—"} {gp.arrivalTime || ""}
                          </p>
                        </div>
                      )}
                      {gp.toLocation && (
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>To Location</p>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.toLocation}</p>
                        </div>
                      )}
                      {gp.outReason && (
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Out Reason</p>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.outReason}</p>
                        </div>
                      )}
                      {(gp.transportMode || gp.companyName || gp.driverName) && (
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Transport</p>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {gp.transportMode} {gp.companyName ? `— ${gp.companyName}` : ""} {gp.driverName ? `/ ${gp.driverName}` : ""}
                          </p>
                        </div>
                      )}
                      {gp.approvedBy && (
                        <div>
                          <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Approved By</p>
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{gp.approvedBy.name}</p>
                        </div>
                      )}
                    </div>

                    {/* Chassis update field */}
                    <div className="mb-5">
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                        Update Chassis Number
                        <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(if different from {gp.chassis || "—"})</span>
                      </label>
                      <input
                        type="text"
                        value={updatedChassis[gp.id] || ""}
                        onChange={(e) => setUpdatedChassis(prev => ({ ...prev, [gp.id]: e.target.value }))}
                        placeholder={gp.chassis || "Enter chassis number"}
                        className="w-full md:w-80 border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                        style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                      />
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => handleAcknowledge(gp.id)}
                      disabled={acknowledging === gp.id}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-70"
                      style={{ background: tabColors[activeTab].active }}
                    >
                      {acknowledging === gp.id ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {acknowledging === gp.id ? "Confirming..." : actionLabel[activeTab]}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Completed section */}
          {completed.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                Completed ({completed.length})
              </p>
              <div className="space-y-2">
                {completed.map(gp => (
                  <div key={gp.id}
                    className="flex items-center justify-between p-4 rounded-xl border"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold font-mono" style={{ color: "var(--text)" }}>{gp.gatePassNumber}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {gp.vehicle} {gp.chassis ? `/ ${gp.chassis}` : ""}
                          {activeTab !== "LT_IN"
                            ? (gp.departureDate ? ` · ${gp.departureDate}` : "")
                            : (gp.arrivalDate ? ` · Arr: ${gp.arrivalDate}` : "")}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 flex-shrink-0">
                      Completed
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
