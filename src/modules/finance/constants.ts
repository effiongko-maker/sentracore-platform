import type { CostReimbursability } from "@/lib/operational/finance";

/** Human labels for reimbursement classification in Finance UI. */
export const COST_REIMBURSABILITY_LABELS: Record<CostReimbursability, string> = {
  unknown: "Unknown",
  reimbursable: "Reimbursable",
  non_reimbursable: "Non-reimbursable",
};

/**
 * Hard UI display cap for every repeated Finance overview list.
 * Dedicated register pages (/finance/costs, /finance/submissions) paginate separately.
 */
export const FINANCE_UI_LIST_LIMIT = 5;

/** Recent costs on Finance overview — exactly five. */
export const FINANCE_RECENT_COSTS_LIMIT = 5;

/**
 * Bounded overview pool for CostRecords (attention + recent slice).
 * Newest-first from Apps Script; not the full sheet.
 */
export const FINANCE_COST_POOL_FETCH_SIZE = 100;

/** Bounded overview pool for Approvals / CostSubmissions. */
export const FINANCE_OVERVIEW_FETCH_SIZE = 100;

/** Concise recent submissions on the Finance overview section. */
export const FINANCE_SUBMISSIONS_PREVIEW_SIZE = 5;

export const CLIENT_AUTHORISATION_STAGES = [
  { id: "draft", label: "Draft / not submitted" },
  { id: "awaiting_decision", label: "Awaiting client decision" },
  { id: "approved", label: "Approved client authorisations" },
  { id: "returned", label: "Returned for clarification" },
  { id: "rejected", label: "Rejected / closed" },
] as const;

/** Non-interactive context chips — Job Order is not a product capability. */
export const OPERATIONAL_COST_LENSES = [
  { id: "facility", label: "By facility" },
  { id: "department", label: "By department" },
  { id: "category", label: "By cost category" },
  { id: "work", label: "By maintenance / work" },
  { id: "execution", label: "By work order" },
] as const;

/** Optional suggestions — not an exhaustive or enforced taxonomy. */
export const SUBMISSION_KIND_SUGGESTIONS = [
  "Monthly contractual",
  "Job / completion-based",
  "Ad hoc reimbursement",
] as const;

export const SUBMISSION_PACKAGE_TYPE_SUGGESTIONS = [
  "Cover sheet",
  "Batch reference",
  "Supporting schedule",
] as const;

export const SUBMISSIONS_LIST_PAGE_SIZE = 25;
