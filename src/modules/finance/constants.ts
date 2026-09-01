import type { ReimbursementStageId } from "./types";

/** Single batch fetch — avoids N+1 while covering typical operational volume. */
export const FINANCE_OVERVIEW_FETCH_SIZE = 100;

export const REIMBURSEMENT_SUBMISSION_STAGES: Array<{
  id: ReimbursementStageId;
  label: string;
}> = [
  { id: "awaiting_cost", label: "Awaiting cost capture" },
  { id: "ready_for_submission", label: "Ready for submission" },
  { id: "submitted", label: "Submitted" },
  { id: "under_review", label: "Awaiting approval / processing" },
  { id: "approved_awaiting_payment", label: "Approved / awaiting payment" },
  { id: "paid", label: "Paid" },
];

export const CLIENT_AUTHORISATION_STAGES = [
  { id: "draft", label: "Draft / not submitted" },
  { id: "awaiting_decision", label: "Awaiting client decision" },
  { id: "approved", label: "Approved" },
  { id: "returned", label: "Returned for clarification" },
  { id: "rejected", label: "Rejected / closed" },
] as const;

export const OPERATIONAL_COST_LENSES = [
  { id: "facility", label: "By facility" },
  { id: "department", label: "By department" },
  { id: "category", label: "By cost category" },
  { id: "work", label: "By maintenance / work" },
  { id: "execution", label: "By WO / JO" },
] as const;
