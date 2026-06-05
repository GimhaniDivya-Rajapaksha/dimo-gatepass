"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ── Small building-block components ───────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold"
      style={{ background: bg, color }}>
      {label}
    </span>
  );
}

function Step({ num, title, desc, color = "#2563eb" }: { num: number; title: string; desc: string; color?: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5"
        style={{ background: color }}>
        {num}
      </div>
      <div>
        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</p>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center my-1">
      <svg className="w-4 h-4" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </div>
  );
}

function StatusPill({ label, dot, bg, color }: { label: string; dot: string; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
      style={{ background: bg, color }}>
      <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

function Card({ title, accent, icon, children }: {
  title: string; accent: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--card-shadow)" }}>
      <button
        className="w-full flex items-center gap-3 px-5 py-4 border-b text-left"
        style={{ borderColor: "var(--border)", background: `${accent}0a` }}
        onClick={() => setOpen(o => !o)}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}20`, color: accent }}>
          {icon}
        </div>
        <h2 className="font-bold text-base flex-1" style={{ color: "var(--text)" }}>{title}</h2>
        <svg className="w-4 h-4 transition-transform flex-shrink-0" style={{ color: accent, transform: open ? "rotate(180deg)" : "none" }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body"
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-5 py-5 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FlowBox({ label, sub, color, bg }: { label: string; sub?: string; color: string; bg: string }) {
  return (
    <div className="rounded-xl px-4 py-2.5 text-center border" style={{ background: bg, borderColor: color + "44" }}>
      <p className="text-xs font-black uppercase tracking-wide" style={{ color }}>{label}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color }}>{sub}</p>}
    </div>
  );
}

function HorizArrow() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function RoleTag({ role, color }: { role: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold"
      style={{ background: color + "18", color }}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {role}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
      <span className="text-xs w-40 flex-shrink-0 pt-0.5 font-semibold" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xs" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "loading" && session?.user?.role !== "DELIVERY_COORDINATOR") {
      router.replace("/");
    }
  }, [status, session, router]);

  if (status === "loading") return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl pb-12 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/delivery-coordinator"
          className="mt-1 w-9 h-9 rounded-xl flex items-center justify-center border transition-all hover:shadow-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#0d9488" }}>Delivery Coordinator</p>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>Complete Gate Pass Guide</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Everything you need to know — from creation to completion.
          </p>
        </div>
      </div>

      {/* ── 1. GATE PASS TYPES ─────────────────────────────────────────────── */}
      <Card title="1. Gate Pass Types" accent="#2563eb"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              type: "Location Transfer", color: "#1d4ed8", bg: "#eff6ff",
              icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
              who: "Initiator / Service Advisor",
              desc: "Vehicle moves between two DIMO locations (branch to branch, showroom to workshop, etc.).",
              examples: ["Showroom A → Showroom B", "HQ → Branch", "Workshop → Delivery point"],
              needsApprover: true, needsCashier: false,
            },
            {
              type: "Customer Delivery", color: "#15803d", bg: "#f0fdf4",
              icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
              who: "Initiator / Cashier",
              desc: "Vehicle is being handed over to a customer. Payment clearance required before Gate Out.",
              examples: ["Invoiced delivery (no approval needed)", "Credit delivery (approver needed)", "Mixed payment (cashier + approver)"],
              needsApprover: true, needsCashier: true,
            },
            {
              type: "After Sales", color: "#7c3aed", bg: "#f5f3ff",
              icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
              who: "Initiator / ASO / Service Advisor",
              desc: "Vehicle coming in for service/repair with a sub-pass chain: Main IN → Sub OUT → Sub IN → Main OUT.",
              examples: ["Customer brings car for service", "Vehicle sent to sub-location", "Final delivery after repair"],
              needsApprover: true, needsCashier: false,
            },
          ].map(t => (
            <div key={t.type} className="rounded-xl border p-4 flex flex-col gap-3"
              style={{ background: t.bg, borderColor: t.color + "33" }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: t.color + "20", color: t.color }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                  </svg>
                </div>
                <p className="text-sm font-black" style={{ color: t.color }}>{t.type}</p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: t.color }}>{t.desc}</p>
              <div className="flex flex-wrap gap-1">
                {t.examples.map(e => (
                  <span key={e} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: t.color + "15", color: t.color }}>{e}</span>
                ))}
              </div>
              <div className="pt-2 border-t flex flex-wrap gap-1.5" style={{ borderColor: t.color + "33" }}>
                <span className="text-[10px] font-bold" style={{ color: t.color }}>Created by:</span>
                <span className="text-[10px]" style={{ color: t.color }}>{t.who}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 2. WHO DOES WHAT ───────────────────────────────────────────────── */}
      <Card title="2. Roles & Responsibilities" accent="#7c3aed"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { role: "Initiator", color: "#2563eb", actions: ["Creates gate passes (LT, CD, After Sales)", "Confirms vehicle departure (Gate Out for some types)", "Marks vehicle arrived for After Sales MAIN_IN", "Resubmits rejected passes with corrections"] },
            { role: "Approver", color: "#7c3aed", actions: ["Reviews and approves/rejects PENDING_APPROVAL passes", "Approves credit payment for Customer Delivery", "Approves After Sales MAIN_OUT with credit orders", "Overrides cashier payment on request"] },
            { role: "Cashier", color: "#d97706", actions: ["Reviews SAP invoice orders for Customer Delivery", "Clears immediate payment orders", "Requests payment override from their assigned approver", "Cannot approve — only review & clear"] },
            { role: "Security Officer", color: "#0f766e", actions: ["Confirms physical Gate OUT at the gate", "Confirms physical Gate IN at destination", "Creates draft gate passes for vehicles at gate", "Sees all passes at their location"] },
            { role: "Area Sales Officer (ASO)", color: "#0891b2", actions: ["Receives After Sales vehicles at sub-location", "Creates SUB_IN passes for vehicle return", "Creates ASO MAIN_OUT for direct customer delivery", "Confirms vehicle arrival at their location"] },
            { role: "Delivery Coordinator", color: "#0d9488", actions: ["Monitors all gate pass activity at their location", "Watches pending, gate-out, and completed passes", "Has read-only overview of entire location flow", "No approval or action capability — observation only"] },
          ].map(r => (
            <div key={r.role} className="rounded-xl border p-4" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: r.color + "20" }}>
                  <svg className="w-3.5 h-3.5" style={{ color: r.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-sm font-black" style={{ color: r.color }}>{r.role}</p>
              </div>
              <ul className="space-y-1">
                {r.actions.map(a => (
                  <li key={a} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 3. CREATION FLOW ───────────────────────────────────────────────── */}
      <Card title="3. How Gate Passes Are Created" accent="#0891b2"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Normal creation */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
              Path A — Initiator Creates
            </p>
            <div className="space-y-2">
              <Step num={1} color="#2563eb" title="Initiator logs in & clicks Create Gate Pass"
                desc="Selects pass type (Location Transfer, Customer Delivery, or After Sales). Fills in vehicle details, destination, departure date/time, transportation info." />
              <Arrow />
              <Step num={2} color="#2563eb" title="Fills required fields"
                desc="Vehicle number (auto-fetched from SAP), chassis, make, colour. For LT: from/to location. For CD: approver. For After Sales: service job number." />
              <Arrow />
              <Step num={3} color="#2563eb" title="Submits → Goes to Pending Approval"
                desc="Pass is created with PENDING_APPROVAL status. The assigned approver is automatically notified by email and in-app notification." />
            </div>
          </div>

          {/* Security creation */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
              Path B — Security Officer Creates (Draft)
            </p>
            <div className="space-y-2">
              <Step num={1} color="#0f766e" title="Security Officer sees vehicle at gate"
                desc="Goes to 'Create Pass' in the security screen. Enters vehicle number, chassis, direction (IN or OUT), and destination." />
              <Arrow />
              <Step num={2} color="#0f766e" title="Draft saved — Initiator notified"
                desc="A DRAFT pass is saved. The Initiator (or Service Advisor) at that location sees it in their 'Pending Forms' sidebar badge." />
              <Arrow />
              <Step num={3} color="#0f766e" title="Initiator opens draft and completes"
                desc="Opens the draft from 'Pending Forms'. All vehicle info is pre-filled. Date/time is auto-set to when Security created it. Initiator just adds carrier/transport details and submits." />
              <Arrow />
              <Step num={4} color="#2563eb" title="Goes to Pending Approval (same as Path A)"
                desc="Once submitted by the Initiator, it joins the normal approval queue." />
            </div>
          </div>
        </div>
      </Card>

      {/* ── 4. APPROVAL FLOW ───────────────────────────────────────────────── */}
      <Card title="4. Approval Flow — Pending → Approved" accent="#f97316"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}>

        {/* Standard approval */}
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Standard Approval (Location Transfer & After Sales)</p>
          <div className="flex items-center gap-2 flex-wrap">
            <FlowBox label="PENDING APPROVAL" sub="Awaiting approver" color="#c2410c" bg="#fff7ed" />
            <HorizArrow />
            <FlowBox label="Approver Reviews" sub="Checks pass details" color="#7c3aed" bg="#f5f3ff" />
            <HorizArrow />
            <div className="flex flex-col gap-2">
              <FlowBox label="APPROVED ✓" sub="Notifies initiator + security" color="#15803d" bg="#f0fdf4" />
              <FlowBox label="REJECTED ✗" sub="Reason sent to initiator" color="#991b1b" bg="#fef2f2" />
            </div>
          </div>
          <div className="mt-3 rounded-xl px-4 py-3 text-xs space-y-1" style={{ background: "var(--surface2)" }}>
            <p style={{ color: "var(--text)" }}><strong>If REJECTED:</strong> Initiator sees the reason, edits the form (vehicle cannot change), adds a "what did you fix?" note, and resubmits. The counter increments (Attempt #2, #3…).</p>
          </div>
        </div>

        {/* CD Payment flow */}
        <div>
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Customer Delivery — Payment Clearance</p>
          <div className="overflow-x-auto pb-2">
            <div className="flex items-start gap-2 min-w-max">
              <div className="flex flex-col items-center gap-1">
                <FlowBox label="INVOICED (H070)" sub="SAP already billed" color="#15803d" bg="#f0fdf4" />
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Skip approval → straight to Gate Out</p>
              </div>
              <div className="mt-3 text-xs font-bold" style={{ color: "var(--text-muted)" }}>OR</div>
              <div className="flex flex-col items-center gap-1">
                <FlowBox label="IMMEDIATE PAYMENT" sub="Cash orders" color="#b45309" bg="#fef3c7" />
                <svg className="w-4 h-4" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <FlowBox label="CASHIER REVIEW" sub="Cashier clears payment" color="#b45309" bg="#fef3c7" />
                <svg className="w-4 h-4" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <FlowBox label="APPROVED" sub="Ready for Gate Out" color="#15803d" bg="#f0fdf4" />
              </div>
              <div className="mt-3 text-xs font-bold" style={{ color: "var(--text-muted)" }}>OR</div>
              <div className="flex flex-col items-center gap-1">
                <FlowBox label="CREDIT ORDERS" sub="Requires approver" color="#1d4ed8" bg="#eff6ff" />
                <svg className="w-4 h-4" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <FlowBox label="CASHIER + APPROVER" sub="Both must clear" color="#7c3aed" bg="#f5f3ff" />
                <svg className="w-4 h-4" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <FlowBox label="APPROVED" sub="Ready for Gate Out" color="#15803d" bg="#f0fdf4" />
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-xl px-4 py-3 text-xs" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
            <p className="font-bold mb-1" style={{ color: "#c2410c" }}>Payment Override:</p>
            <p style={{ color: "#92400e" }}>If the cashier cannot clear payment (e.g. SAP unavailable), they can click <strong>Request Override</strong>. This notifies their assigned approver, who can approve Gate Out directly from their dashboard.</p>
          </div>
        </div>
      </Card>

      {/* ── 5. GATE OUT ────────────────────────────────────────────────────── */}
      <Card title="5. Gate Out — Two Methods" accent="#1d4ed8"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Method A: Print */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#22c55e55" }}>
            <div className="px-4 py-3 border-b" style={{ background: "#f0fdf4", borderColor: "#22c55e55" }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#22c55e", color: "#fff" }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </div>
                <p className="text-sm font-black" style={{ color: "#15803d" }}>Method A — Print Gate Pass</p>
              </div>
            </div>
            <div className="px-4 py-4 space-y-2">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Available for <strong>Location Transfer</strong> and <strong>Customer Delivery</strong> passes once APPROVED.
              </p>
              <div className="space-y-2">
                <Step num={1} color="#15803d" title="Initiator opens the approved pass"
                  desc="Goes to gate pass detail page. A green 'Print Gate Pass' button is available." />
                <Arrow />
                <Step num={2} color="#15803d" title="Clicks Print Gate Pass"
                  desc="The system automatically marks the pass as GATE_OUT (departure date/time recorded). The browser print dialog opens." />
                <Arrow />
                <Step num={3} color="#15803d" title="Physical copy goes with vehicle"
                  desc="The printed pass contains vehicle details, chassis, route, approver signature area, and QR-style info. The driver carries this." />
              </div>
              <div className="mt-2 rounded-lg px-3 py-2 text-[11px]" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <strong style={{ color: "#15803d" }}>Note:</strong>
                <span style={{ color: "#166534" }}> For Customer Delivery, printing immediately COMPLETES the pass — no further confirmation needed.</span>
              </div>
            </div>
          </div>

          {/* Method B: Security */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#3b82f655" }}>
            <div className="px-4 py-3 border-b" style={{ background: "#eff6ff", borderColor: "#3b82f655" }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#3b82f6", color: "#fff" }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-sm font-black" style={{ color: "#1d4ed8" }}>Method B — Security Officer Gate Out</p>
              </div>
            </div>
            <div className="px-4 py-4 space-y-2">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Used for <strong>All pass types</strong> where physical gate confirmation is required (mandatory for After Sales MAIN_OUT).
              </p>
              <div className="space-y-2">
                <Step num={1} color="#1d4ed8" title="Security Officer goes to Gate IN / OUT page"
                  desc="The security screen shows all APPROVED passes at their location. They can search by vehicle or GP number." />
                <Arrow />
                <Step num={2} color="#1d4ed8" title="Finds the pass and slides to confirm"
                  desc="A slide-to-confirm control prevents accidental confirmations. Security can note any chassis mismatch." />
                <Arrow />
                <Step num={3} color="#1d4ed8" title="Status moves to GATE_OUT"
                  desc="Actual departure date and time is stamped. The destination is notified (Security Officer there + Initiators/ASO)." />
                <Arrow />
                <Step num={4} color="#1d4ed8" title="Destination Security confirms Gate IN"
                  desc="When vehicle arrives, the destination Security Officer confirms Gate IN → pass moves to COMPLETED." />
              </div>
            </div>
          </div>
        </div>

        {/* Which method for which type */}
        <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="px-4 py-2 border-b text-xs font-black uppercase tracking-widest" style={{ background: "var(--surface2)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
            Which method applies to which pass type?
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Pass Type", "Print Gate Out", "Security Gate Out", "Notes"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-bold" style={{ color: "var(--text-muted)", background: "var(--surface2)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {[
                  ["Location Transfer", "✓ Yes", "✓ Yes", "Either method works. Print auto-records Gate Out."],
                  ["Customer Delivery", "✓ Yes", "✓ Yes", "Print = immediate COMPLETED. Security = GATE_OUT → then recipient confirms."],
                  ["After Sales MAIN_IN", "✗ No", "✓ Yes", "Security confirms when vehicle arrives at DIMO for service."],
                  ["After Sales SUB_OUT", "✗ No", "✓ Security or Initiator", "Initiator can confirm Gate Out directly for sub-passes."],
                  ["After Sales MAIN_OUT", "✗ No", "✓ Yes (mandatory)", "Requires approver first, then Security confirms Gate Out."],
                ].map(([type, print, security, note], i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: "var(--text)" }}>{type}</td>
                    <td className="px-4 py-2.5" style={{ color: print.startsWith("✓") ? "#15803d" : "#991b1b" }}>{print}</td>
                    <td className="px-4 py-2.5" style={{ color: security.startsWith("✓") ? "#1d4ed8" : "#991b1b" }}>{security}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* ── 6. AFTER SALES CHAIN ───────────────────────────────────────────── */}
      <Card title="6. After Sales Sub-Pass Chain" accent="#7c3aed"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}>

        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          After Sales passes follow a multi-step chain. Each step is a separate gate pass linked to the original MAIN_IN.
        </p>

        <div className="overflow-x-auto pb-2">
          <div className="flex items-start gap-3 min-w-max">
            {[
              { sub: "MAIN IN", color: "#15803d", bg: "#f0fdf4", dot: "#22c55e", who: "Initiator", action: "Vehicle arrives at DIMO for service", security: "Security confirms Gate IN when vehicle arrives" },
              { sub: "SUB OUT", color: "#1d4ed8", bg: "#eff6ff", dot: "#3b82f6", who: "Initiator / ASO", action: "Vehicle sent to sub-location (repair center)", security: "Security or Initiator confirms Gate Out from DIMO" },
              { sub: "SUB IN", color: "#92400e", bg: "#fffbeb", dot: "#f59e0b", who: "ASO (creates)", action: "Vehicle returns from sub-location to DIMO", security: "Security at DIMO confirms Gate IN" },
              { sub: "MAIN OUT", color: "#6b21a8", bg: "#fdf4ff", dot: "#a855f7", who: "ASO / Initiator", action: "Final delivery to customer", security: "Approver → Security confirms Gate Out → Recipient confirms" },
            ].map((step, idx, arr) => (
              <div key={step.sub} className="flex items-start gap-3">
                <div className="rounded-xl border p-4 w-44 flex flex-col gap-2" style={{ background: step.bg, borderColor: step.dot + "44" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: step.dot }} />
                    <p className="text-xs font-black" style={{ color: step.color }}>{step.sub}</p>
                  </div>
                  <p className="text-[11px] font-semibold" style={{ color: step.color }}>{step.action}</p>
                  <div className="pt-2 border-t" style={{ borderColor: step.dot + "33" }}>
                    <p className="text-[10px] font-bold mb-0.5" style={{ color: step.color }}>Created by:</p>
                    <p className="text-[10px]" style={{ color: step.color }}>{step.who}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold mb-0.5" style={{ color: step.color }}>Confirmed by:</p>
                    <p className="text-[10px]" style={{ color: step.color }}>{step.security}</p>
                  </div>
                </div>
                {idx < arr.length - 1 && (
                  <div className="flex items-center mt-8">
                    <svg className="w-5 h-5" style={{ color: "var(--border)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-4 space-y-2" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
          <p className="text-xs font-bold" style={{ color: "var(--text)" }}>Direct MAIN_IN → MAIN_OUT (no sub-location)</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            If the vehicle does not need to visit a sub-location, the chain is shortened: MAIN_IN (vehicle arrives) → MAIN_OUT (direct customer delivery). The Initiator searches for the MAIN_IN pass by number in Create Gate Pass to create the MAIN_OUT.
          </p>
        </div>
      </Card>

      {/* ── 7. STATUS MEANINGS ─────────────────────────────────────────────── */}
      <Card title="7. What Every Status Means" accent="#0d9488"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { status: "DRAFT", dot: "#f59e0b", color: "#92400e", bg: "#fffbeb", meaning: "Security created a draft. Waiting for Initiator/SA to open and complete the form before it enters the approval queue.", who: "Next: Initiator completes the form" },
            { status: "PENDING APPROVAL", dot: "#f97316", color: "#c2410c", bg: "#fff7ed", meaning: "Pass submitted and waiting for the assigned approver to review and approve or reject it.", who: "Next: Approver reviews" },
            { status: "CASHIER REVIEW", dot: "#f59e0b", color: "#b45309", bg: "#fef3c7", meaning: "Customer Delivery with immediate/credit payment orders. Waiting for cashier to clear payment and/or approver to approve credit.", who: "Next: Cashier clears payment" },
            { status: "APPROVED", dot: "#22c55e", color: "#15803d", bg: "#f0fdf4", meaning: "Pass is approved. Vehicle can now physically leave the gate. Security Officer is notified and can confirm Gate Out.", who: "Next: Gate Out (print or security)" },
            { status: "INITIATOR CONFIRMED", dot: "#a855f7", color: "#6d28d9", bg: "#f5f3ff", meaning: "Initiator confirmed departure for a sub-pass (SUB_OUT). Waiting for source Security Officer to physically release the vehicle.", who: "Next: Security confirms Gate Out" },
            { status: "GATE OUT", dot: "#3b82f6", color: "#1d4ed8", bg: "#eff6ff", meaning: "Vehicle has physically left the source gate. It is in transit. Destination is waiting for the vehicle to arrive.", who: "Next: Destination confirms Gate In" },
            { status: "COMPLETED", dot: "#8b5cf6", color: "#5b21b6", bg: "#f5f3ff", meaning: "Pass fully completed. Vehicle arrived at destination and receipt was confirmed. No further action needed.", who: "Final state — no action needed" },
            { status: "REJECTED", dot: "#ef4444", color: "#991b1b", bg: "#fef2f2", meaning: "Approver rejected the pass with a reason. Initiator must edit the form and resubmit.", who: "Next: Initiator edits & resubmits" },
            { status: "CANCELLED", dot: "#9ca3af", color: "#6b7280", bg: "#f9fafb", meaning: "Initiator cancelled the pass while it was still PENDING_APPROVAL. Cannot be undone — a new pass must be created.", who: "Final state — create a new pass" },
          ].map(s => (
            <div key={s.status} className="rounded-xl border p-3 flex gap-3"
              style={{ background: s.bg, borderColor: s.dot + "44" }}>
              <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: s.dot }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black" style={{ color: s.color }}>{s.status}</p>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: s.color + "cc" }}>{s.meaning}</p>
                <p className="text-[10px] mt-1.5 font-bold" style={{ color: s.color }}>→ {s.who}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 8. RECIPIENT GATE IN ───────────────────────────────────────────── */}
      <Card title="8. Confirming Vehicle Receipt (Gate In)" accent="#22c55e"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8l-4 4m0 0l4 4m-4-4h18" /></svg>}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Security Officer (Destination)</p>
            <div className="space-y-2">
              <Step num={1} color="#22c55e" title="Vehicle arrives at destination gate"
                desc="Security at the destination location opens the Gate IN/OUT page. The GATE_OUT pass appears in their list." />
              <Arrow />
              <Step num={2} color="#22c55e" title="Verifies vehicle details"
                desc="Checks vehicle plate and chassis number match the gate pass. Can flag a mismatch and add a note." />
              <Arrow />
              <Step num={3} color="#22c55e" title="Slides to confirm Gate IN"
                desc="Uses the slide-to-confirm control. Pass moves to COMPLETED. Source Initiator and destination team are notified." />
            </div>
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Recipient / Initiator (Vehicle Arrivals)</p>
            <div className="space-y-2">
              <Step num={1} color="#10b981" title="Open Vehicle Arrivals"
                desc="Initiators and Recipients see GATE_OUT passes heading to their location in 'Vehicle Arrivals' page." />
              <Arrow />
              <Step num={2} color="#10b981" title="Click Confirm Received"
                desc="Confirm the vehicle arrived. Optionally note any chassis mismatch. For Location Transfer, this completes the pass." />
              <Arrow />
              <Step num={3} color="#10b981" title="Pass moves to COMPLETED"
                desc="The pass is fully closed. The original Initiator is notified. The vehicle location is updated in SAP automatically." />
            </div>
            <div className="mt-3 rounded-xl px-3 py-2.5 text-xs" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <strong style={{ color: "#15803d" }}>SAP Update:</strong>
              <span style={{ color: "#166534" }}> When Gate IN is confirmed, the system automatically updates the vehicle&apos;s plant location in SAP to the destination location.</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 9. NOTIFICATIONS ───────────────────────────────────────────────── */}
      <Card title="9. Notifications — Who Gets Notified When" accent="#f59e0b"
        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>}>

        <div className="space-y-2">
          {[
            { event: "Pass Submitted (PENDING_APPROVAL)", notified: "Assigned Approver → email + in-app", color: "#f97316" },
            { event: "Pass Approved", notified: "Initiator (creator) → in-app", color: "#22c55e" },
            { event: "Pass Rejected", notified: "Initiator (creator) → in-app with reason", color: "#ef4444" },
            { event: "Pass Resubmitted", notified: "All Approvers + Admins → in-app", color: "#f97316" },
            { event: "Cashier Clears Payment (CD)", notified: "Initiator + Security Officers at fromLocation → in-app", color: "#f59e0b" },
            { event: "Security confirms Gate OUT", notified: "Pass creator + Destination Security + Destination Initiators/ASO → in-app", color: "#3b82f6" },
            { event: "Security confirms Gate IN (SUB_OUT)", notified: "Pass creator + Original MAIN_IN Initiator + Destination Initiators → in-app", color: "#22c55e" },
            { event: "Initiator confirms Gate OUT (SUB_OUT)", notified: "Destination Security + ASO → in-app", color: "#3b82f6" },
            { event: "Payment Override Requested", notified: "Cashier's assigned approver → in-app", color: "#f97316" },
            { event: "Payment Override Approved", notified: "Initiator + Security Officers → in-app", color: "#22c55e" },
            { event: "Location Transfer Gate OUT", notified: "Destination Security + Initiators → in-app", color: "#3b82f6" },
          ].map(n => (
            <div key={n.event} className="flex gap-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: n.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: "var(--text)" }}>{n.event}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>→ {n.notified}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

    </motion.div>
  );
}
