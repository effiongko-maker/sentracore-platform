/**
 * Energy Reading — AEDC meter-reading register (not Work / Maintenance / Incident / Issue).
 */

/** Canonical Energy Reading domain model. */
export interface EnergyReading {
  id: string;
  /** Calendar date of the reading (ISO date `YYYY-MM-DD`). */
  date: string;
  /** Meter No. — free-text label; optional (no asset link). */
  meter: string;
  /** Observed meter value entered by Facility Management. */
  reading: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/** Create input — observed reading only; no consumption calculation. */
export interface CreateEnergyReadingInput {
  date: string;
  /** Optional Meter No. free-text label. */
  meter?: string;
  reading: number;
  remarks?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateEnergyReadingInput = Partial<CreateEnergyReadingInput> & {
  id: string;
};

export type EnergyReadingSort = "newest" | "oldest" | "date_desc" | "date_asc";

export interface EnergyReadingListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  meter?: string | "all";
  /** Inclusive lower bound on `date` (ISO date). */
  dateFrom?: string;
  /** Inclusive upper bound on `date` (ISO date). */
  dateTo?: string;
  sort?: EnergyReadingSort;
}

export type EnergyReadingModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; entry: EnergyReading }
  | { type: "view"; entry: EnergyReading };
