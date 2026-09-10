/**
 * Generator Log — operational run log (not Work / Maintenance / Incident / Issue).
 */

/** Canonical Generator Log domain model. */
export interface GeneratorLog {
  id: string;
  /** Calendar date of the run (ISO date `YYYY-MM-DD`). */
  date: string;
  /** Generator identity / label for v1 (no asset link yet). */
  generator: string;
  /** Run start (ISO datetime). */
  startedAt: string;
  /** Run end (ISO datetime). */
  endedAt: string;
  /** Derived from startedAt → endedAt; never manually entered. */
  hours: number;
  fuelUsed: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/**
 * Create input — hours are calculated by the domain util / future service,
 * not accepted as a manual field.
 */
export interface CreateGeneratorLogInput {
  date: string;
  generator: string;
  startedAt: string;
  endedAt: string;
  fuelUsed: number;
  remarks?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateGeneratorLogInput = Partial<CreateGeneratorLogInput> & {
  id: string;
};

export type GeneratorLogSort = "newest" | "oldest" | "date_desc" | "date_asc";

export interface GeneratorLogListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  generator?: string | "all";
  /** Inclusive lower bound on `date` (ISO date). */
  dateFrom?: string;
  /** Inclusive upper bound on `date` (ISO date). */
  dateTo?: string;
  sort?: GeneratorLogSort;
}

export type GeneratorLogModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; entry: GeneratorLog }
  | { type: "view"; entry: GeneratorLog };
