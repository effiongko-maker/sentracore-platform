import type { Issue, IssueExecutionRef, IssueWorkOrderRef } from "./types";
import { executionKindFromWorkInstruction } from "@/modules/work-orders/instructionKind";

/**
 * Map related Work Orders to execution refs.
 *
 * Authoritative Order Type is the persisted WO `orderType`
 * (`resolveWorkInstructionKind`). Legacy missing orderType → work_order.
 * Estimated cost is not used. Reimbursability remains a separate Finance
 * dimension. No separate Job Order sheet/entity is introduced here.
 */
export function mapWorkOrderToExecutionRef(
  wo: IssueWorkOrderRef
): IssueExecutionRef {
  const kind = executionKindFromWorkInstruction({
    orderType: wo.orderType,
  });

  return {
    kind,
    id: wo.id,
    status: wo.status,
    title: wo.title,
    approvalAuthority: kind === "job_order" ? "hq_evc" : "annex_director",
    viaTreatmentId: wo.viaTreatmentId,
    viaTreatmentKind: wo.viaTreatmentKind,
  };
}

export function deriveIssueExecutions(issue: Issue): IssueExecutionRef[] {
  return issue.workOrders.map(mapWorkOrderToExecutionRef);
}

/**
 * Job Order — explicit Order Type selection on the work-order register.
 *
 * `implemented: false` means there is no separate Job Order sheet/entity —
 * not that the operating distinction is ignored in UI.
 */
export const JOB_ORDER_BOUNDARY = {
  kind: "job_order" as const,
  approvalAuthority: "hq_evc" as const,
  issuedBy: "procurement" as const,
  instruction: "written_formal" as const,
  /** No separate JO register/entity — classification on existing WO records. */
  implemented: false,
  classifiedOnWorkOrderRegister: true,
  note: "Job Order = explicit Order Type on the work-order register. Independent of estimated cost and reimbursability. No parallel JO system.",
} as const;

/**
 * Work Order — explicit Order Type (also the legacy default when Order Type is missing).
 * Independent of estimated cost and reimbursability.
 */
export const WORK_ORDER_BOUNDARY = {
  kind: "work_order" as const,
  approvalAuthority: "annex_director" as const,
  instruction: "verbal" as const,
  implemented: true,
  note: "Work Order = explicit Order Type (legacy records without Order Type default here). Independent of estimated cost and reimbursability. Client/NCC APR remains an optional commercial package — not HQ/EVC.",
} as const;
