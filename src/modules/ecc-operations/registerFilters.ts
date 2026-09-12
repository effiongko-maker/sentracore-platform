import {
  ECC_OPEN_ISSUE_STATUSES,
  ECC_OPEN_REQUEST_STATUSES,
} from "./constants";
import type {
  EccIssue,
  EccIssueClassification,
  EccPriority,
  EccRegisterView,
  EccRequest,
  EccRequestOrigin,
  EccSeverity,
} from "./types";

function nameMatch(owner: string | undefined, actingAs: string): boolean {
  if (!actingAs.trim()) return false;
  return (owner ?? "").trim().toLowerCase() === actingAs.trim().toLowerCase();
}

function isUrgentPriority(priority: EccPriority): boolean {
  return priority === "high" || priority === "urgent";
}

/** Structured Issues register filters (replaces pill views). */
export type EccIssueFilterState = {
  status: "open" | "resolved" | "all";
  severity: "all" | EccSeverity;
  assignment: "all" | "mine" | "unassigned";
  escalation: "all" | "escalated" | "not_escalated";
  waiting: "all" | "someone_else";
  classification: "all" | EccIssueClassification;
};

export const ECC_ISSUE_FILTER_DEFAULTS: EccIssueFilterState = {
  status: "open",
  severity: "all",
  assignment: "all",
  escalation: "all",
  waiting: "all",
  classification: "all",
};

export function eccIssueFiltersAreActive(filters: EccIssueFilterState): boolean {
  return (
    filters.status !== ECC_ISSUE_FILTER_DEFAULTS.status ||
    filters.severity !== ECC_ISSUE_FILTER_DEFAULTS.severity ||
    filters.assignment !== ECC_ISSUE_FILTER_DEFAULTS.assignment ||
    filters.escalation !== ECC_ISSUE_FILTER_DEFAULTS.escalation ||
    filters.waiting !== ECC_ISSUE_FILTER_DEFAULTS.waiting ||
    filters.classification !== ECC_ISSUE_FILTER_DEFAULTS.classification
  );
}

export function applyEccIssueFilters(
  issues: EccIssue[],
  filters: EccIssueFilterState,
  actingAs: string
): EccIssue[] {
  return issues.filter((row) => {
    if (filters.status === "open") {
      if (!ECC_OPEN_ISSUE_STATUSES.includes(row.status)) return false;
    } else if (filters.status === "resolved") {
      if (row.status !== "resolved" && row.status !== "closed") return false;
    }

    if (filters.severity !== "all" && row.severity !== filters.severity) {
      return false;
    }

    if (filters.assignment === "mine") {
      if (!nameMatch(row.currentOwnerName, actingAs)) return false;
    } else if (filters.assignment === "unassigned") {
      if (Boolean(row.currentOwnerName?.trim())) return false;
    }

    if (filters.escalation === "escalated") {
      if (row.status !== "escalated") return false;
    } else if (filters.escalation === "not_escalated") {
      if (row.status === "escalated") return false;
    }

    if (filters.waiting === "someone_else") {
      if (
        !ECC_OPEN_ISSUE_STATUSES.includes(row.status) ||
        row.status === "escalated" ||
        !row.currentOwnerName?.trim() ||
        nameMatch(row.currentOwnerName, actingAs)
      ) {
        return false;
      }
    }

    if (
      filters.classification !== "all" &&
      row.classification !== filters.classification
    ) {
      return false;
    }

    return true;
  });
}

/** Structured Requests register filters (replaces pill views). */
export type EccRequestFilterState = {
  status: "open" | "resolved" | "all";
  /** `urgent_high` preserves the former “Urgent / high” pill. */
  priority: "all" | "urgent_high" | EccPriority;
  assignment: "all" | "mine" | "unassigned";
  /** RM / downstream hand-off — request equivalent of escalation. */
  handoff: "all" | "with_rm" | "not_with_rm";
  waiting: "all" | "someone_else";
  origin: "all" | EccRequestOrigin;
};

export const ECC_REQUEST_FILTER_DEFAULTS: EccRequestFilterState = {
  status: "open",
  priority: "all",
  assignment: "all",
  handoff: "all",
  waiting: "all",
  origin: "all",
};

export function eccRequestFiltersAreActive(
  filters: EccRequestFilterState
): boolean {
  return (
    filters.status !== ECC_REQUEST_FILTER_DEFAULTS.status ||
    filters.priority !== ECC_REQUEST_FILTER_DEFAULTS.priority ||
    filters.assignment !== ECC_REQUEST_FILTER_DEFAULTS.assignment ||
    filters.handoff !== ECC_REQUEST_FILTER_DEFAULTS.handoff ||
    filters.waiting !== ECC_REQUEST_FILTER_DEFAULTS.waiting ||
    filters.origin !== ECC_REQUEST_FILTER_DEFAULTS.origin
  );
}

function isRequestWithRm(status: EccRequest["status"]): boolean {
  return (
    status === "with_relationship_manager" || status === "with_downstream"
  );
}

export function applyEccRequestFilters(
  requests: EccRequest[],
  filters: EccRequestFilterState,
  actingAs: string
): EccRequest[] {
  return requests.filter((row) => {
    if (filters.status === "open") {
      if (!ECC_OPEN_REQUEST_STATUSES.includes(row.status)) return false;
    } else if (filters.status === "resolved") {
      if (
        row.status !== "resolved" &&
        row.status !== "closed" &&
        row.status !== "cancelled"
      ) {
        return false;
      }
    }

    if (filters.priority === "urgent_high") {
      if (!isUrgentPriority(row.priority)) return false;
    } else if (
      filters.priority !== "all" &&
      row.priority !== filters.priority
    ) {
      return false;
    }

    if (filters.assignment === "mine") {
      if (!nameMatch(row.currentOwnerName, actingAs)) return false;
    } else if (filters.assignment === "unassigned") {
      if (Boolean(row.currentOwnerName?.trim())) return false;
    }

    if (filters.handoff === "with_rm") {
      if (!isRequestWithRm(row.status)) return false;
    } else if (filters.handoff === "not_with_rm") {
      if (isRequestWithRm(row.status)) return false;
    }

    if (filters.waiting === "someone_else") {
      if (
        !ECC_OPEN_REQUEST_STATUSES.includes(row.status) ||
        !row.currentOwnerName?.trim() ||
        nameMatch(row.currentOwnerName, actingAs)
      ) {
        return false;
      }
    }

    if (filters.origin !== "all" && row.origin !== filters.origin) {
      return false;
    }

    return true;
  });
}

/** @deprecated Prefer applyEccIssueFilters — kept for legacy callers. */
export function filterEccIssues(
  issues: EccIssue[],
  view: EccRegisterView,
  actingAs: string
): EccIssue[] {
  switch (view) {
    case "open":
      return applyEccIssueFilters(
        issues,
        { ...ECC_ISSUE_FILTER_DEFAULTS, status: "open" },
        actingAs
      );
    case "urgent": {
      const high = applyEccIssueFilters(
        issues,
        { ...ECC_ISSUE_FILTER_DEFAULTS, status: "open", severity: "high" },
        actingAs
      );
      const critical = applyEccIssueFilters(
        issues,
        { ...ECC_ISSUE_FILTER_DEFAULTS, status: "open", severity: "critical" },
        actingAs
      );
      const ids = new Set(high.map((row) => row.id));
      return [...high, ...critical.filter((row) => !ids.has(row.id))];
    }
    case "mine":
      return applyEccIssueFilters(
        issues,
        { ...ECC_ISSUE_FILTER_DEFAULTS, status: "open", assignment: "mine" },
        actingAs
      );
    case "escalated":
      return applyEccIssueFilters(
        issues,
        { ...ECC_ISSUE_FILTER_DEFAULTS, status: "all", escalation: "escalated" },
        actingAs
      );
    case "waiting":
      return applyEccIssueFilters(
        issues,
        {
          ...ECC_ISSUE_FILTER_DEFAULTS,
          status: "open",
          waiting: "someone_else",
        },
        actingAs
      );
    case "resolved":
      return applyEccIssueFilters(
        issues,
        { ...ECC_ISSUE_FILTER_DEFAULTS, status: "resolved" },
        actingAs
      );
    case "all":
    default:
      return applyEccIssueFilters(
        issues,
        { ...ECC_ISSUE_FILTER_DEFAULTS, status: "all" },
        actingAs
      );
  }
}

/** @deprecated Prefer applyEccRequestFilters. */
export function filterEccRequests(
  requests: EccRequest[],
  view: EccRegisterView,
  actingAs: string
): EccRequest[] {
  switch (view) {
    case "open":
      return applyEccRequestFilters(
        requests,
        { ...ECC_REQUEST_FILTER_DEFAULTS, status: "open" },
        actingAs
      );
    case "urgent":
      return applyEccRequestFilters(
        requests,
        {
          ...ECC_REQUEST_FILTER_DEFAULTS,
          status: "open",
          priority: "urgent_high",
        },
        actingAs
      );
    case "mine":
      return applyEccRequestFilters(
        requests,
        { ...ECC_REQUEST_FILTER_DEFAULTS, status: "open", assignment: "mine" },
        actingAs
      );
    case "escalated":
      return applyEccRequestFilters(
        requests,
        { ...ECC_REQUEST_FILTER_DEFAULTS, status: "all", handoff: "with_rm" },
        actingAs
      );
    case "waiting":
      return applyEccRequestFilters(
        requests,
        {
          ...ECC_REQUEST_FILTER_DEFAULTS,
          status: "open",
          waiting: "someone_else",
        },
        actingAs
      );
    case "resolved":
      return applyEccRequestFilters(
        requests,
        { ...ECC_REQUEST_FILTER_DEFAULTS, status: "resolved" },
        actingAs
      );
    case "all":
    default:
      return applyEccRequestFilters(
        requests,
        { ...ECC_REQUEST_FILTER_DEFAULTS, status: "all" },
        actingAs
      );
  }
}

export const ECC_REGISTER_VIEW_LABELS: Record<EccRegisterView, string> = {
  open: "Open",
  urgent: "Urgent / high",
  mine: "Assigned to me",
  escalated: "Escalated / with RM",
  waiting: "Waiting on someone else",
  resolved: "Resolved",
  all: "All",
};

const ACTING_AS_KEY = "sentracore.ecc.actingAs";

export function readEccActingAs(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ACTING_AS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeEccActingAs(name: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTING_AS_KEY, name.trim());
  } catch {
    /* ignore */
  }
}
