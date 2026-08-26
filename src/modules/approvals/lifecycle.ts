import type {
  Approval,
  ApprovalActivityEntry,
  ApprovalStatus,
} from "./types";

/**
 * Canonical Approval lifecycle (persisted):
 *   draft → awaiting_decision → approved | rejected
 *   (+ returned | cancelled | expired | closed)
 *
 * Legacy aliases normalize here so UI is driven by one field.
 */
export function normalizeApprovalStatus(
  status: ApprovalStatus | string | undefined | null,
  submittedAt?: string | null
): ApprovalStatus {
  const value = String(status ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");

  const mapped: ApprovalStatus =
    value === "draft" ||
    value === "generated" ||
    value === "awaiting_submission"
      ? "draft"
      : value === "awaiting_decision" ||
          value === "submitted" ||
          value === "awaiting_response"
        ? "awaiting_decision"
        : value === "approved"
          ? "approved"
          : value === "rejected"
            ? "rejected"
            : value === "returned" ||
                value === "returned_for_clarification" ||
                value === "query"
              ? "returned"
              : value === "cancelled" || value === "canceled"
                ? "cancelled"
                : value === "expired"
                  ? "expired"
                  : value === "closed"
                    ? "closed"
                    : "draft";

  // Heal inconsistent rows: submittedAt set but status still draft.
  if (submittedAt && String(submittedAt).trim() && mapped === "draft") {
    return "awaiting_decision";
  }

  return mapped;
}

/** Package created / not yet sent to client. */
export function isAwaitingSubmission(status: ApprovalStatus): boolean {
  return normalizeApprovalStatus(status) === "draft";
}

/** Sent to client; waiting on decision (or returned for clarification). */
export function isAwaitingResponse(status: ApprovalStatus): boolean {
  const n = normalizeApprovalStatus(status);
  return n === "awaiting_decision" || n === "returned";
}

export function isTerminalApprovalStatus(status: ApprovalStatus): boolean {
  const n = normalizeApprovalStatus(status);
  return (
    n === "approved" ||
    n === "rejected" ||
    n === "cancelled" ||
    n === "expired" ||
    n === "closed"
  );
}

export type ApprovalLifecycleActions = {
  canView: boolean;
  canPrint: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  canEditSubmission: boolean;
  canFollowUp: boolean;
  canRecordDecision: boolean;
  canCancel: boolean;
};

export function getApprovalLifecycleActions(
  status: ApprovalStatus,
  submittedAt?: string | null
): ApprovalLifecycleActions {
  const n = normalizeApprovalStatus(status, submittedAt);
  const terminal = isTerminalApprovalStatus(n);

  return {
    canView: true,
    canPrint: true,
    canEdit: !terminal,
    canSubmit: n === "draft",
    canEditSubmission: n === "awaiting_decision" || n === "returned",
    canFollowUp: n === "awaiting_decision" || n === "returned",
    canRecordDecision: n === "awaiting_decision" || n === "returned",
    canCancel: !terminal && n !== "closed",
  };
}

export function parseApprovalActivityLog(
  raw?: string | null
): ApprovalActivityEntry[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row === "object")
      .map((row) => {
        const entry = row as Record<string, unknown>;
        return {
          id: String(entry.id ?? ""),
          action: String(
            entry.action ?? "approval_updated"
          ) as ApprovalActivityEntry["action"],
          at: String(entry.at ?? ""),
          summary: String(entry.summary ?? ""),
          actorUserId: entry.actorUserId
            ? String(entry.actorUserId)
            : undefined,
          data:
            entry.data && typeof entry.data === "object"
              ? (entry.data as Record<string, unknown>)
              : undefined,
        };
      })
      .filter((row) => row.id && row.at);
  } catch {
    return [];
  }
}

export function appendApprovalActivity(
  existingLog: string | undefined,
  entry: ApprovalActivityEntry
): string {
  const current = parseApprovalActivityLog(existingLog);
  current.push(entry);
  const trimmed = current.slice(-40);
  return JSON.stringify(trimmed);
}

export function withParsedActivities(approval: Approval): Approval {
  const status = normalizeApprovalStatus(approval.status, approval.submittedAt);
  return {
    ...approval,
    status,
    activities: parseApprovalActivityLog(approval.activityLog),
  };
}

export function newActivityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
