/**
 * Deep Cleaning Log — operational deep-cleaning register
 * (not Work / Maintenance / Incident / Approval / Asset).
 */

/** Canonical Deep Cleaning Log domain model. */
export interface DeepCleaningLog {
  id: string;
  /** Cleaning date (ISO date `YYYY-MM-DD`). */
  date: string;
  /** Facility identity (Facility ID). */
  facilityId: string;
  /** Area cleaned. */
  area: string;
  /** Vendor or team that performed the cleaning. */
  vendorTeam: string;
  /** Activity status (free text — source does not define an enum). */
  status: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/** Create input — no derived fields. */
export interface CreateDeepCleaningLogInput {
  date: string;
  facilityId: string;
  area: string;
  vendorTeam: string;
  status: string;
  remarks?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateDeepCleaningLogInput = Partial<CreateDeepCleaningLogInput> & {
  id: string;
};

export type DeepCleaningLogSort =
  | "newest"
  | "oldest"
  | "date_desc"
  | "date_asc";

export interface DeepCleaningLogListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  facilityId?: string | "all";
  status?: string | "all";
  /** Inclusive lower bound on `date`. */
  dateFrom?: string;
  /** Inclusive upper bound on `date`. */
  dateTo?: string;
  sort?: DeepCleaningLogSort;
}

export type DeepCleaningLogModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; entry: DeepCleaningLog }
  | { type: "view"; entry: DeepCleaningLog };
