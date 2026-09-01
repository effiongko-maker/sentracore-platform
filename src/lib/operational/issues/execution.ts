import type { Issue, IssueExecutionRef, IssueWorkOrderRef } from "./types";

/**
 * Map related Work Orders to execution refs.
 * Job Order is a future EVC/HQ + Procurement path — never emitted here.
 *
 * Work Order approvalAuthority defaults to annex_director (conceptual).
 * Do NOT label every WO as HQ/EVC. Client APR is a separate package.
 */
export function mapWorkOrderToExecutionRef(
  wo: IssueWorkOrderRef
): IssueExecutionRef {
  return {
    kind: "work_order",
    id: wo.id,
    status: wo.status,
    title: wo.title,
    approvalAuthority: "annex_director",
    viaTreatmentId: wo.viaTreatmentId,
    viaTreatmentKind: wo.viaTreatmentKind,
  };
}

export function deriveIssueExecutions(issue: Issue): IssueExecutionRef[] {
  return issue.workOrders.map(mapWorkOrderToExecutionRef);
}

/**
 * Job Order boundary — future execution path.
 * Not implemented. Do not collapse into Work Order. Do not treat as Treatment.
 */
export const JOB_ORDER_BOUNDARY = {
  kind: "job_order" as const,
  approvalAuthority: "hq_evc" as const,
  issuedBy: "procurement" as const,
  implemented: false,
  note: "Job Order = distinct execution path: EVC/HQ approval chain; Procurement issues the Job Order. Annex Director boundary OPEN. Do not use ₦1m rule without ops evidence.",
} as const;

export const WORK_ORDER_BOUNDARY = {
  kind: "work_order" as const,
  approvalAuthority: "annex_director" as const,
  implemented: true,
  note: "Work Order = existing formal executable work. Annex-level approval may be sufficient where applicable. Client/NCC APR is optional and non-blocking — not HQ/EVC.",
} as const;
