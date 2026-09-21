import type { CommandCentreAttentionItem } from "@/modules/command-centre/presentationTypes";

/**
 * Executive Commitments — pure domain rules (no I/O).
 *
 * A commitment is an explicit obligation or delegated follow-up an authorised executive
 * tracks. Deliberately small: open → completed | cancelled. Overdue is DERIVED from the
 * due date in the organisation's calendar and is never stored.
 */

export const COMMITMENT_STATUSES = ["open", "completed", "cancelled"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const COMMITMENT_TITLE_MAX = 200;
export const COMMITMENT_DESCRIPTION_MAX = 2000;

export type CommitmentRecord = {
  id: string;
  title: string;
  description: string | null;
  createdByProfileId: string;
  assigneeProfileId: string;
  /** Calendar date (YYYY-MM-DD) in the organisation's timezone; null = no due date. */
  dueDate: string | null;
  status: CommitmentStatus;
  completedAt: string | null;
  createdAt: string;
};

export type CommitmentView = CommitmentRecord & {
  createdByName: string;
  assigneeName: string;
  overdue: boolean;
};

/** Overdue = open AND due date strictly before today's organisation-local date. */
export function isCommitmentOverdue(
  input: { status: CommitmentStatus; dueDate: string | null },
  today: string
): boolean {
  return input.status === "open" && input.dueDate !== null && input.dueDate < today;
}

/** Deterministic order: overdue (oldest due first) → open with a due date (soonest first) → open without a due date. */
export function compareOpenCommitments(a: CommitmentView, b: CommitmentView): number {
  const rank = (c: CommitmentView) => (c.overdue ? 0 : c.dueDate ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  return a.createdAt.localeCompare(b.createdAt);
}

export function partitionCommitments(
  records: CommitmentRecord[],
  names: Map<string, string>,
  today: string
): { overdue: CommitmentView[]; open: CommitmentView[]; completed: CommitmentView[] } {
  const views = records.map((r): CommitmentView => ({
    ...r,
    createdByName: names.get(r.createdByProfileId) ?? "Unknown person",
    assigneeName: names.get(r.assigneeProfileId) ?? "Unknown person",
    overdue: isCommitmentOverdue(r, today),
  }));
  const openViews = views.filter((v) => v.status === "open").sort(compareOpenCommitments);
  return {
    overdue: openViews.filter((v) => v.overdue),
    open: openViews.filter((v) => !v.overdue),
    // Cancelled commitments are history, never shown as outstanding or overdue.
    completed: views
      .filter((v) => v.status === "completed")
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
  };
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y!, m! - 1, d!))
  );
}
export { dateLabel as commitmentDateLabel };

/**
 * Executive attention from commitments: ONLY overdue open commitments qualify — the executive
 * chose to track the obligation and it has passed its agreed date. Open, due-soon, delegated
 * or self-assigned commitments do not, and completed/cancelled ones never do.
 */
export function overdueCommitmentAttentionItems(overdue: CommitmentView[]): CommandCentreAttentionItem[] {
  return overdue
    .filter((c) => c.overdue && c.status === "open" && c.dueDate)
    .map((c) => ({
      id: `commitments:${c.id}`,
      title: c.title,
      detail: `Overdue · due ${dateLabel(c.dueDate!)} · ${c.assigneeName}`,
      tone: "high" as const,
      href: "/command-centre#commitments",
      sourceLabel: "Commitments",
    }));
}

export type CommitmentInput = {
  title: string;
  description?: string | null;
  assigneeProfileId: string;
  dueDate?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Validate/normalise creation input; returns an error message or the clean value. */
export function validateCommitmentInput(
  input: Partial<CommitmentInput>
): { ok: true; value: { title: string; description: string | null; assigneeProfileId: string; dueDate: string | null } } | { ok: false; message: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return { ok: false, message: "A title is required." };
  if (title.length > COMMITMENT_TITLE_MAX) return { ok: false, message: `Title must be ${COMMITMENT_TITLE_MAX} characters or fewer.` };
  const description = typeof input.description === "string" && input.description.trim() ? input.description.trim() : null;
  if (description && description.length > COMMITMENT_DESCRIPTION_MAX) {
    return { ok: false, message: `Context must be ${COMMITMENT_DESCRIPTION_MAX} characters or fewer.` };
  }
  if (!isUuid(input.assigneeProfileId)) return { ok: false, message: "Choose who owns this commitment." };
  const dueDate = input.dueDate == null || input.dueDate === "" ? null : input.dueDate;
  if (dueDate !== null && !isCalendarDate(dueDate)) return { ok: false, message: "Due date must be a valid date." };
  return { ok: true, value: { title, description, assigneeProfileId: input.assigneeProfileId, dueDate } };
}
