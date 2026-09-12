import {
  ECC_ISSUE_TRANSITIONS,
  ECC_REQUEST_TRANSITIONS,
} from "@/modules/ecc-operations/constants";
import type {
  EccIssueHistoryKind,
  EccIssueStatus,
  EccRequestHistoryKind,
  EccRequestStatus,
  EccSectionCondition,
} from "@/modules/ecc-operations/types";

export function assertIssueTransition(from: EccIssueStatus, to: EccIssueStatus) {
  if (!ECC_ISSUE_TRANSITIONS[from].includes(to)) {
    throw new Error(`Cannot move issue from ${from} to ${to}.`);
  }
}

export function assertRequestTransition(
  from: EccRequestStatus,
  to: EccRequestStatus
) {
  if (!ECC_REQUEST_TRANSITIONS[from].includes(to)) {
    throw new Error(`Cannot move request from ${from} to ${to}.`);
  }
}

export function issueHistoryKind(to: EccIssueStatus): EccIssueHistoryKind {
  if (to === "escalated") return "escalation";
  if (to === "resolved") return "resolution";
  if (to === "closed") return "closure";
  return "status_change";
}

export function requestHistoryKind(to: EccRequestStatus): EccRequestHistoryKind {
  if (to === "resolved") return "resolution";
  if (to === "closed") return "closure";
  return "status_change";
}

export function sectionNeedsAttention(status: EccSectionCondition): boolean {
  return status === "issue" || status === "disrupted";
}

export function normalizeSectionInput<
  T extends { status: EccSectionCondition; noIssuesToReport: boolean },
>(section: T): T {
  if (section.status === "normal") {
    return { ...section, noIssuesToReport: true };
  }
  return { ...section, noIssuesToReport: false };
}

export function nowIso(): string {
  return new Date().toISOString();
}
