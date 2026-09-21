/**
 * Consumables Update — operational stock register (not Work / Maintenance / Incident / Approval).
 */

/** Canonical Consumables Update domain model. */
export interface ConsumablesUpdate {
  id: string;
  /** Stable item identity for the facility (carry-forward key). */
  itemId: string;
  /** Calendar date of the update (ISO date `YYYY-MM-DD`). */
  date: string;
  /** Facility identity (Facility ID). */
  facilityId: string;
  /** Consumable item name. */
  itemName: string;
  /** Opening quantity. */
  opening: number;
  /** Quantity received (optional). */
  received?: number;
  /** Quantity issued. */
  issued: number;
  /**
   * Derived: Opening + Received − Issued.
   * Never manually entered; recalculated on create/update.
   */
  closing: number;
  /**
   * Reorder threshold. When omitted on input, carried forward from the
   * item's most recent prior entry when available.
   */
  reorderLevel?: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

/**
 * Create input — closing is calculated by the domain util / service,
 * not accepted as a manual field. itemId is assigned by persistence.
 */
export interface CreateConsumablesUpdateInput {
  date: string;
  facilityId: string;
  itemName: string;
  opening: number;
  received?: number;
  issued: number;
  reorderLevel?: number;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateConsumablesUpdateInput = Partial<CreateConsumablesUpdateInput> & {
  id: string;
};

export type ConsumablesUpdateSort =
  | "newest"
  | "oldest"
  | "date_desc"
  | "date_asc";

export interface ConsumablesUpdateListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  facilityId?: string | "all";
  itemName?: string | "all";
  itemId?: string | "all";
  /** Inclusive lower bound on `date` (ISO date). */
  dateFrom?: string;
  /** Inclusive upper bound on `date` (ISO date). */
  dateTo?: string;
  sort?: ConsumablesUpdateSort;
}

export type ConsumablesUpdateFlagKind = "reorder_now";

export type ConsumablesUpdateModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; entry: ConsumablesUpdate }
  | { type: "view"; entry: ConsumablesUpdate };


/** One quantity exactly as the historical register recorded it. */
export interface RegisterQuantity {
  /** null = not recorded (never 0). */
  quantity: number | null;
  /** Unit as recorded ("Gallons", "pcs", …); null when no quantity was recorded. */
  unit: string | null;
  /** Source cell text, verbatim ("19 Gallons", "-", "12pcs"), when preserved. */
  raw: string | null;
}

/**
 * Migrated historical register EVIDENCE (fm_consumables_register_entries). Not a stock transaction and not a
 * dated update: the register carries no transaction date, no balance is derived and units are never reconciled
 * across fields.
 */
export interface ConsumablesRegisterEntry {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  facilityId: string;
  /** null = the register states no date (always the case for migrated entries). */
  snapshotDate: string | null;
  opening: RegisterQuantity;
  received: RegisterQuantity;
  issued: RegisterQuantity;
  closing: RegisterQuantity;
  reorderLevel: RegisterQuantity;
  recordOrigin: "migrated_historical";
}
