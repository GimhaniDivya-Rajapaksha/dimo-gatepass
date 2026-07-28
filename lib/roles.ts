export const APPROVER_ROLES = ["APPROVER", "SPECIAL_APPROVER"] as const;

export function isApproverRole(role?: string | null): boolean {
  return !!role && (APPROVER_ROLES as readonly string[]).includes(role);
}
