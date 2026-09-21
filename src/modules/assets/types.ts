export type AssetStatus = "active" | "inactive" | "pending" | "suspended";

export type AssetCondition = "excellent" | "good" | "fair" | "poor" | "unknown";

export type AssetCriticality =
  | "unassessed"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type AssetCategory =
  | "hvac"
  | "power"
  | "electrical"
  | "mechanical"
  | "vertical_transport"
  | "fire_safety"
  | "it"
  | "other";

export interface Asset {
  /** Canonical UUID — the only relational identity. */
  id: string;
  /** Org-scoped display reference (AST-YYYY-######). Never a relationship key. */
  code: string;
  /** Facility UUID (tenant-safe relationship). */
  facilityId: string;
  /** Facility display name projected from facilityId. */
  facility: string;
  name: string;
  category: AssetCategory;
  manufacturer: string;
  model: string;
  serialNumber: string;
  installDate: string;
  warrantyExpiry: string;
  oemId: string;
  condition: AssetCondition;
  status: AssetStatus;
  /** Assigned person as a profile UUID (empty when unassigned). */
  assignedToUserId: string;
  /** Assigned person display name projected from the profile. */
  assignedTo: string;
  criticality: AssetCriticality;
  /**
   * Derived client-side (no Assets sheet workload column).
   * activeWorkload = workOrders + maintenance + incidents (active only),
   * keyed by canonical assetId.
   */
  activeWorkload?: number;
  workloadBreakdown?: {
    workOrders: number;
    maintenance: number;
    incidents: number;
  };
}

export interface CreateAssetInput {
  name: string;
  category: AssetCategory;
  /** Facility UUID. */
  facilityId: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  installDate: string;
  warrantyExpiry: string;
  oemId: string;
  condition: AssetCondition;
  status: AssetStatus;
  /** Profile UUID, or empty for unassigned. */
  assignedToUserId: string;
  criticality: AssetCriticality;
}

export type UpdateAssetInput = Partial<CreateAssetInput>;

export type AssetSort =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc";

export interface AssetListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AssetStatus | "all";
  category?: AssetCategory | "all";
  /** Facility UUID filter. */
  facilityId?: string | "all";
  criticality?: AssetCriticality | "all";
  sort?: AssetSort;
}

export type AssetModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; asset: Asset }
  | { type: "view"; asset: Asset }
  | { type: "deactivate"; asset: Asset };
