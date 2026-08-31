/**
 * Conceptual approval / processing authorities (Phase 5/6).
 * Types and docs only — no gates, no behaviour change to Client APR.
 *
 * Distinct from each other and from payment.
 */

/** Who may authorise or process work/cost in the operating model. */
export type IssueAuthorityRole =
  /** Local / annex authorisation — intended WO-path gate where applicable (OPEN sequence). */
  | "annex_director"
  /** Escalated HQ / EVC chain — intended Job Order path (OPEN sequence). */
  | "hq_evc"
  /** External client / NCC commercial package (existing APR) — not the internal authority model. */
  | "client_ncc"
  /** Issues Job Orders after required approvals — processing step (future). */
  | "procurement";

/**
 * Intended association of authority to execution path.
 * Not enforced in software in Phase 6.
 */
export type IssueAuthorityContext =
  | "work_order_path"
  | "job_order_path"
  | "client_package"
  | "cost_submission"
  | "unspecified";

export const ISSUE_AUTHORITY_ROLES: readonly IssueAuthorityRole[] = [
  "annex_director",
  "hq_evc",
  "client_ncc",
  "procurement",
] as const;

export const ISSUE_AUTHORITY_NOTES = {
  annex_director:
    "Annex Director — local authorisation; may be sufficient for Work Order path where applicable. Not implemented as a software gate.",
  hq_evc:
    "HQ/EVC — escalated approval chain for Job Order path. Not implemented.",
  client_ncc:
    "Client/NCC — existing optional Client Approval (APR) package on Work Orders; non-blocking today; not the foundation for Annex/HQ/JO.",
  procurement:
    "Procurement — issues Job Orders after required approvals. Not implemented.",
} as const satisfies Record<IssueAuthorityRole, string>;
