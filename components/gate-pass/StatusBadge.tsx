import { statusColors } from "@/lib/mock-data";
import { GatePassStatus } from "@/types/gate-pass";

const statusLabels: Record<GatePassStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  GATE_OUT: "Gate Out",
  RECEIVED: "Received",
  COMPLETED: "Completed",
};

export default function StatusBadge({ status }: { status: GatePassStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
