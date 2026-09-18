export default function SapDowntimeNotice() {
  return (
    <div
      className="px-4 py-2.5 text-xs sm:text-sm text-center leading-relaxed"
      style={{ background: "#fffbeb", borderBottom: "1px solid #fde68a", color: "#78350f" }}
    >
      <strong>Notice: Planned SAP S/4 HANA Downtime</strong> — The{" "}
      <strong>DIMO SAP S/4 HANA Production System</strong> will be unavailable from{" "}
      <strong>Friday, 18th September 2026, 20:00 H</strong> to{" "}
      <strong>Sunday, 20th September 2026, 17:00 H</strong> due to the{" "}
      <strong>SAP S/4 HANA and Proaxia Version Upgrade</strong>. Impact:{" "}
      <strong>All DIMO SAP / VSS Users</strong>. For any issues, contact the{" "}
      <strong>SAP Support Desk</strong> at{" "}
      <a href="mailto:Support.SAP@dimolanka.com" className="underline font-semibold">
        Support.SAP@dimolanka.com
      </a>
      .
    </div>
  );
}
