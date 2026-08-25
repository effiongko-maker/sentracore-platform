export type AssetStatus = "active" | "inactive" | "pending" | "suspended";

export type AssetCondition = "excellent" | "good" | "fair" | "poor";

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
  id: string;
  assetTag: string;
  name: string;
  category: AssetCategory;
  facility: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyExpiry: string;
  condition: AssetCondition;
  status: AssetStatus;
  assignedTo: string;
  criticality: AssetCriticality;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetInput {
  /** System-generated on create when omitted. Immutable after create. */
  assetTag?: string;
  name: string;
  category: AssetCategory;
  facility: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyExpiry: string;
  condition: AssetCondition;
  status: AssetStatus;
  assignedTo: string;
  criticality: AssetCriticality;
  description?: string;
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
  facility?: string | "all";
  criticality?: AssetCriticality | "all";
  sort?: AssetSort;
}

export type AssetModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; asset: Asset }
  | { type: "view"; asset: Asset }
  | { type: "deactivate"; asset: Asset };
