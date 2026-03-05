export type TransferType = "DIMO_TO_DIMO" | "DIMO_TO_DEALER" | "DIMO_TO_PROMOTION";

export type GatePassStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "GATE_OUT"
  | "RECEIVED"
  | "COMPLETED";

export type GatePassDirection = "GATE_OUT" | "GATE_IN";

export interface GatePass {
  id: string;
  gatePassNumber: string;
  chassisNumber: string;
  transferType: TransferType;
  direction: GatePassDirection;
  departureDate: string;
  departureTime: string;
  transportationDetails: string;
  comments?: string;
  attachments?: string[];
  recipient: string;
  recipientLocation?: string;
  status: GatePassStatus;
  isInvoiced: boolean;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  updatedChassisNumber?: string;
}

export interface CreateGatePassInput {
  chassisNumber: string;
  transferType: TransferType;
  direction: GatePassDirection;
  departureDate: string;
  departureTime: string;
  transportationDetails: string;
  comments?: string;
  recipient: string;
  recipientLocation?: string;
  isInvoiced: boolean;
}
