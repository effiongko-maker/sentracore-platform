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
  /** Generator hour-meter reading at the start of the run (the register's "Start Reading"). Not a time. */
  startMeterReading: number | null;
  /** Generator hour-meter reading at the end of the run (the register's "End Reading"). Not a time. */
  endMeterReading: number | null;
  /** Run hours — derived by the database (end reading − start reading); never manually entered. */
  hours: number;
  /**
   * Diesel used on this DATE by all generators (the date total), carried by at most one log of the date — never this
   * generator's own consumption. null = not recorded on this log (never 0).
   */
  fuelUsed: number | null;
  /** hour_meter (readings) | clock_times (legacy basis; never written by the product). */
  logBasis: "hour_meter" | "clock_times";
  /** Legacy clock-time basis only: run start/end instants. null for every hour-meter log. */
  startedAt: string | null;
  endedAt: string | null;
  recordOrigin: "operational" | "migrated_historical";
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/**
 * Create input — run hours are derived from the meter readings, never accepted as a manual field.
 */
export interface CreateGeneratorLogInput {
  date: string;
  generator: string;
  startMeterReading: number;
  endMeterReading: number;
  /** null = not recorded. */
  fuelUsed: number | null;
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
