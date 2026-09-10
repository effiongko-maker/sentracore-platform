/**
 * Waste Log — operational waste register (not Work / Maintenance / Incident / Approval).
 */

/** Canonical Waste Log domain model. */
export interface WasteLog {
  id: string;
  /** Calendar date of the log (ISO date `YYYY-MM-DD`). */
  date: string;
  /** Facility identity (Facility ID). */
  facilityId: string;
  /** Waste type label. */
  wasteType: string;
  /** Quantity recorded. */
  quantity: number;
  /** Unit of measure. */
  unit: string;
  /** Disposal method. */
  disposalMethod: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/** Create input — no derived fields. */
export interface CreateWasteLogInput {
  date: string;
  facilityId: string;
  wasteType: string;
  quantity: number;
  unit: string;
  disposalMethod: string;
  remarks?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateWasteLogInput = Partial<CreateWasteLogInput> & {
  id: string;
};

export type WasteLogSort = "newest" | "oldest" | "date_desc" | "date_asc";

export interface WasteLogListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  facilityId?: string | "all";
  wasteType?: string | "all";
  /** Inclusive lower bound on `date` (ISO date). */
  dateFrom?: string;
  /** Inclusive upper bound on `date` (ISO date). */
  dateTo?: string;
  sort?: WasteLogSort;
}

export type WasteLogModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; entry: WasteLog }
  | { type: "view"; entry: WasteLog };
