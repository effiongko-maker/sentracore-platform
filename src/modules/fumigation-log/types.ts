/**
 * Fumigation Log — operational pest-treatment register
 * (not Work / Maintenance / Incident / Approval / Asset).
 */

/** Derived display state from nextDueDate — never persisted. */
export type FumigationDueState = "overdue" | "due_soon" | "scheduled";

/** Canonical Fumigation Log domain model. */
export interface FumigationLog {
  id: string;
  /** Treatment date (ISO date `YYYY-MM-DD`). */
  date: string;
  /** Facility identity (Facility ID). */
  facilityId: string;
  /** Area that was treated. */
  areaTreated: string;
  /** Pest type targeted. */
  pestType: string;
  /** Vendor / applicator. */
  vendor: string;
  /** Next scheduled treatment date (ISO date `YYYY-MM-DD`). */
  nextDueDate: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/** Create input — no derived due-state fields. */
export interface CreateFumigationLogInput {
  date: string;
  facilityId: string;
  areaTreated: string;
  pestType: string;
  vendor: string;
  nextDueDate: string;
  remarks?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateFumigationLogInput = Partial<CreateFumigationLogInput> & {
  id: string;
};

export type FumigationLogSort =
  | "newest"
  | "oldest"
  | "date_desc"
  | "date_asc"
  | "next_due_asc"
  | "next_due_desc";

export interface FumigationLogListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  facilityId?: string | "all";
  /** Inclusive lower bound on treatment `date`. */
  dateFrom?: string;
  /** Inclusive upper bound on treatment `date`. */
  dateTo?: string;
  /** Inclusive lower bound on `nextDueDate`. */
  nextDueFrom?: string;
  /** Inclusive upper bound on `nextDueDate`. */
  nextDueTo?: string;
  sort?: FumigationLogSort;
}

export type FumigationLogModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; entry: FumigationLog }
  | { type: "view"; entry: FumigationLog };
