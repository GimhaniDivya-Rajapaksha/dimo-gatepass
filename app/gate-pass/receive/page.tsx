"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { mockGatePasses, transferTypeLabels } from "@/lib/mock-data";
import { GatePass } from "@/types/gate-pass";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

export default function ReceivePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "RECIPIENT") {
      router.replace("/");
    }
  }, [status, session, router]);

  const [passes, setPasses] = useState<GatePass[]>(
    mockGatePasses.filter((gp) => gp.status === "APPROVED" || gp.status === "RECEIVED")
  );
  const [updatedChassis, setUpdatedChassis] = useState<Record<string, string>>({});

  if (status === "loading") return null;

  const handleAcknowledge = (id: string) => {
    setPasses((prev) =>
      prev.map((gp) =>
        gp.id === id
          ? {
              ...gp,
              status: "RECEIVED",
              receivedBy: "Gate Officer",
              receivedAt: new Date().toISOString(),
              updatedChassisNumber: updatedChassis[id] || gp.chassisNumber,
            }
          : gp
      )
    );
  };

  const toReceive = passes.filter((gp) => gp.status === "APPROVED");
  const received = passes.filter((gp) => gp.status === "RECEIVED");

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className="mb-6">
        <h1 className="text-3xl font-bold gradient-text">Receive / Acknowledge</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Acknowledge vehicle receipt and update chassis number if needed
        </p>
      </motion.div>

      {toReceive.length === 0 && received.length === 0 && (
        <motion.div variants={item} className="flex flex-col items-center justify-center h-64 rounded-2xl border"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            style={{ color: "var(--text-muted)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p style={{ color: "var(--text-muted)" }}>No gate passes awaiting receipt</p>
        </motion.div>
      )}

      <AnimatePresence>
        {toReceive.length > 0 && (
          <motion.div variants={item} className="space-y-4 mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Awaiting Receipt ({toReceive.length})
            </p>
            {toReceive.map((gp) => (
              <motion.div key={gp.id} layout
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                className="rounded-2xl border overflow-hidden"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #3b82f6, #6366f1)" }} />
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="font-bold text-lg" style={{ color: "var(--accent)" }}>{gp.gatePassNumber}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Approved</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-xl mb-5"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    {[
                      { label: "Chassis Number", value: gp.chassisNumber, mono: true },
                      { label: "Transfer Type", value: transferTypeLabels[gp.transferType] },
                      { label: "Recipient", value: gp.recipient },
                      { label: "Departure", value: `${gp.departureDate} ${gp.departureTime}` },
                      { label: "Transportation", value: gp.transportationDetails },
                      { label: "Approved By", value: gp.approvedBy || "-" },
                    ].map((d) => (
                      <div key={d.label}>
                        <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>{d.label}</p>
                        <p className={`text-sm font-medium ${d.mono ? "font-mono" : ""}`} style={{ color: "var(--text)" }}>{d.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mb-5">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>
                      Update Chassis Number
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>(if different)</span>
                    </label>
                    <input type="text"
                      value={updatedChassis[gp.id] || ""}
                      onChange={(e) => setUpdatedChassis((prev) => ({ ...prev, [gp.id]: e.target.value }))}
                      placeholder={gp.chassisNumber}
                      className="w-full md:w-96 border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                      style={{ background: "var(--surface2)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Leave blank to keep original chassis number</p>
                  </div>

                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handleAcknowledge(gp.id)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md"
                    style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Acknowledge Receipt
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {received.length > 0 && (
        <motion.div variants={item} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Received ({received.length})
          </p>
          {received.map((gp) => (
            <motion.div key={gp.id} layout
              className="flex items-center justify-between p-4 rounded-xl border"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{gp.gatePassNumber}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{gp.updatedChassisNumber || gp.chassisNumber}</p>
                    {gp.updatedChassisNumber && gp.updatedChassisNumber !== gp.chassisNumber && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Updated</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>by {gp.receivedBy}</span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Received</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
