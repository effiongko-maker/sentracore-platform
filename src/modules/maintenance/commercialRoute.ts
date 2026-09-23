/**
 * Work commercial route (fm_work.commercial_route, UI "Execution basis") — workflow rules shared by the Work, Work
 * Instruction and Approval repositories and the UI. Pure: no I/O, safe for verify scripts.
 *
 *   work_order : Issue → Execute → Work Order (after execution). No prior client approval.
 *   job_order  : Issue → Request Approval → Approval Granted → Job Order Issued → Execute.
 *   NULL       : legacy-unclassified Work — previous behaviour (explicit Order Type, no approval gate).
 *
 * Each rule returns a user-facing refusal message, or null when allowed. Callers raise their own validation error.
 */
import type { WorkInstructionKind } from "@/modules/work-orders/instructionKind";

/** Work statuses that mean execution has started. */
export const EXECUTION_STATUSES: readonly string[] = ["in_progress", "completed"];

/** The only Approval status that is a granted client decision (approved / partially approved). */
export const GRANTED_APPROVAL_STATUS = "approved";

function asRoute(route: string | null | undefined): WorkInstructionKind | null {
  return route === "work_order" || route === "job_order" ? route : null;
}

/**
 * Order Type of a Work Instruction. Classified Work: derived from the route; a supplied value that differs is
 * refused. Legacy Work: the explicit selection is required (unchanged behaviour).
 */
export function resolveInstructionOrderType(
  route: string | null | undefined,
  supplied: WorkInstructionKind | undefined
): { ok: true; orderType: WorkInstructionKind } | { ok: false; message: string } {
  const classified = asRoute(route);
  if (classified) {
    if (supplied && supplied !== classified) {
      return {
        ok: false,
        message: `This Work's execution basis is ${classified === "job_order" ? "Job Order" : "Work Order"}: a ${
          supplied === "job_order" ? "Job Order" : "Work Order"
        } cannot be created for it.`,
      };
    }
    return { ok: true, orderType: classified };
  }
  if (!supplied) return { ok: false, message: "Select Order Type: Work Order or Job Order." };
  return { ok: true, orderType: supplied };
}

/** A Job Order on Job Order-route Work is recorded only once the client's Approval is granted. */
export function jobOrderIssueBlock(input: {
  route: string | null | undefined;
  orderType: WorkInstructionKind;
  approvalStatus: string | null | undefined;
}): string | null {
  if (asRoute(input.route) !== "job_order" || input.orderType !== "job_order") return null;
  if (!input.approvalStatus) return "Request client approval first: a Job Order is issued only after the client approves.";
  if (input.approvalStatus !== GRANTED_APPROVAL_STATUS) {
    return "The client has not approved this Work: a Job Order can be recorded only after approval is granted.";
  }
  return null;
}

/**
 * Job Order-route Work may not start or complete until the client's Approval is granted AND the issued Job Order is
 * recorded. Work Order-route and legacy Work are not gated.
 */
export function jobOrderExecutionBlock(input: {
  route: string | null | undefined;
  status: string;
  approvalStatus: string | null | undefined;
  hasJobOrder: boolean;
}): string | null {
  if (asRoute(input.route) !== "job_order" || !EXECUTION_STATUSES.includes(input.status)) return null;
  if (input.approvalStatus !== GRANTED_APPROVAL_STATUS) {
    return "Execution is blocked: this Job Order Work needs the client's approval first.";
  }
  if (!input.hasJobOrder) {
    return "Execution is blocked: record the issued Job Order before starting this Work.";
  }
  return null;
}

/** Only operational Job Order-route Work takes a Work-level client Approval. */
export function workApprovalBlock(input: { route: string | null | undefined; recordOrigin: string }): string | null {
  if (input.recordOrigin === "migrated_historical") {
    return "Imported historical Work is read-only: a client approval cannot be requested for it.";
  }
  if (asRoute(input.route) !== "job_order") {
    return "Client approval before execution applies only to Job Order Work.";
  }
  return null;
}

/** Classified Work requests its client approval from the Work, never from a Work Instruction. */
export function instructionApprovalBlock(route: string | null | undefined): string | null {
  const classified = asRoute(route);
  if (classified === "job_order") return "Request client approval from the Work: it must precede the Job Order.";
  if (classified === "work_order") return "Work Order Work does not require prior client approval.";
  return null;
}

/**
 * Work Order route: the Work Order is the post-execution submission for completed Work — it never authorises
 * execution, so it is refused until the Work is completed.
 */
export function workOrderSubmissionBlock(input: {
  route: string | null | undefined;
  orderType: WorkInstructionKind;
  workStatus: string;
}): string | null {
  if (asRoute(input.route) !== "work_order" || input.orderType !== "work_order") return null;
  if (input.workStatus !== "completed") {
    return "Submit the Work Order once the Work is completed: it records completed work for client payment.";
  }
  return null;
}

/**
 * A Client Payment links to a Work Order only as a payment request, for an operational Work Order on Work Order-route
 * Work (legacy and historical records keep their previous behaviour: no link).
 */
export function workOrderClientPaymentBlock(input: {
  kind: string;
  orderType: string;
  route: string | null | undefined;
  recordOrigin: string;
}): string | null {
  if (input.kind !== "payment_request") return "Only a payment request can be raised for a Work Order.";
  if (input.orderType !== "work_order") return "A client payment request is raised for a Work Order, not a Job Order.";
  if (input.recordOrigin === "migrated_historical") return "Imported historical Work Orders are read-only source records.";
  if (asRoute(input.route) !== "work_order") {
    return "Client payment requests are linked to Work Orders on Work Order-route Work.";
  }
  return null;
}

/**
 * Work Order route: once a Work Order has been submitted for completed Work, the Work may not leave "completed" through
 * an ordinary transition (no reopen / reversal workflow exists).
 */
export function workReopenBlock(input: {
  route: string | null | undefined;
  fromStatus: string;
  toStatus: string;
  hasWorkOrder: boolean;
}): string | null {
  if (asRoute(input.route) !== "work_order" || !input.hasWorkOrder) return null;
  if (input.fromStatus === "completed" && input.toStatus !== "completed") {
    return "This Work has a submitted Work Order: it cannot be moved out of completed.";
  }
  return null;
}
