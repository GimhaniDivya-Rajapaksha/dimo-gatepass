export type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);
const ListIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const FlagIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);
const BoxIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const XCircleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const VehicleReportIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h10z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 8h4l3 3v5h-7V8z" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export const navItemsByRole: Record<string, NavItem[]> = {
  ADMIN: [
    { label: "User Management", href: "/admin", icon: <UsersIcon /> },
  ],
  AREA_SALES_OFFICER: [
    { label: "Dashboard", href: "/initiator", icon: <DashboardIcon /> },
    { label: "My Gate Passes", href: "/gate-pass", icon: <ListIcon /> },
    { label: "Create Sub-Pass", href: "/gate-pass/create", icon: <PlusIcon /> },
    { label: "Pending", href: "/gate-pass?status=PENDING_APPROVAL", icon: <ClockIcon /> },
    { label: "Completed", href: "/gate-pass?status=COMPLETED", icon: <FlagIcon /> },
    { label: "Vehicle Report", href: "/vehicle-report", icon: <VehicleReportIcon /> },
  ],
  CASHIER: [
    { label: "Dashboard", href: "/initiator", icon: <DashboardIcon /> },
    { label: "Order Review", href: "/gate-pass/cashier-review", icon: <CheckIcon /> },
    { label: "All Gate Passes", href: "/gate-pass", icon: <ListIcon /> },
    { label: "Completed", href: "/gate-pass?status=COMPLETED", icon: <FlagIcon /> },
    { label: "Vehicle Report", href: "/vehicle-report", icon: <VehicleReportIcon /> },
  ],
  INITIATOR: [
    { label: "Dashboard", href: "/initiator", icon: <DashboardIcon /> },
    { label: "My Gate Passes", href: "/gate-pass", icon: <ListIcon /> },
    { label: "Create Gate Pass", href: "/gate-pass/create", icon: <PlusIcon /> },
    { label: "Pending", href: "/gate-pass?status=PENDING_APPROVAL", icon: <ClockIcon /> },
    { label: "Rejected", href: "/gate-pass/rejected", icon: <XCircleIcon /> },
    { label: "Sent to Recipient", href: "/gate-pass?status=GATE_OUT", icon: <BoxIcon /> },
    { label: "Completed", href: "/gate-pass?status=COMPLETED", icon: <FlagIcon /> },
    { label: "Vehicle Report", href: "/vehicle-report", icon: <VehicleReportIcon /> },
  ],
  APPROVER: [
    { label: "Dashboard", href: "/approver", icon: <DashboardIcon /> },
    { label: "Pending Requests", href: "/gate-pass/approve", icon: <CheckIcon /> },
    { label: "All Gate Passes", href: "/gate-pass", icon: <ListIcon /> },
    { label: "Completed", href: "/gate-pass?status=COMPLETED", icon: <FlagIcon /> },
    { label: "Vehicle Report", href: "/vehicle-report", icon: <VehicleReportIcon /> },
  ],
  RECIPIENT: [
    { label: "Dashboard", href: "/recipient", icon: <DashboardIcon /> },
    { label: "Awaiting Acknowledgement", href: "/gate-pass/receive", icon: <BoxIcon /> },
    { label: "All Gate Passes", href: "/gate-pass", icon: <ListIcon /> },
  ],
};
