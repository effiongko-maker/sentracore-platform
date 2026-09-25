/**
 * Diesel Usage — operational diesel tank register (not Work / Maintenance / Incident / Approval).
 */

/** Canonical Diesel Usage domain model. */
export interface DieselUsage {
  id: string;
  /** Calendar date of the log (ISO date `YYYY-MM-DD`). */
  date: string;
  /** Facility identity (Facility ID). */
  facilityId: string;
  /**
   * Generator identity (Generator ID) — free label/id for v1 (no asset link). null ONLY for a migrated historical
   * whole-site tank row: no generator is evidenced and none is inferred.
   */
  generatorId: string | null;
  /**
   * Every value below is AS RECORDED; null = not recorded (never 0). Tank readings are physical observations: no
   * arithmetic between them is enforced (see dieselVariance for the shown-not-corrected difference).
   */
  /** Opening tank reading in litres. */
  openingLevel: number | null;
  /** Underground tank quantity (source checklist column). */
  undergroundTankQty?: number | null;
  /** Surface tank quantity (source checklist column). */
  surfaceTankQty?: number | null;
  /** Diesel delivered in litres. */
  added?: number | null;
  /** Closing tank reading / balance in litres. */
  closingLevel: number | null;
  /** Consumption in litres as recorded (not derived). */
  consumption: number | null;
  /**
   * migrated_historical rows come from the MBORA diesel-tank checklist: a whole-site tank measurement with no
   * generator (`generatorId` is null) to which no per-generator threshold applies. Never set from input.
   */
  recordOrigin?: "operational" | "migrated_historical";
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/** Create input — each value as recorded; null/omitted = not recorded. At least one observation is required. */
export interface CreateDieselUsageInput {
  date: string;
  facilityId: string;
  generatorId: string;
  openingLevel?: number | null;
  added?: number | null;
  closingLevel?: number | null;
  consumption?: number | null;
  undergroundTankQty?: number | null;
  surfaceTankQty?: number | null;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateDieselUsageInput = Partial<CreateDieselUsageInput> & {
  id: string;
};

export type DieselUsageSort = "newest" | "oldest" | "date_desc" | "date_asc";

export interface DieselUsageListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  facilityId?: string | "all";
  generatorId?: string | "all";
  /** Inclusive lower bound on `date` (ISO date). */
  dateFrom?: string;
  /** Inclusive upper bound on `date` (ISO date). */
  dateTo?: string;
  sort?: DieselUsageSort;
}

export type DieselUsageFlagKind = "high_usage" | "negative_consumption";

export type DieselUsageModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; entry: DieselUsage }
  | { type: "view"; entry: DieselUsage };
