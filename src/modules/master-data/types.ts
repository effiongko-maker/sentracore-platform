export type MasterDataEntity =
  | "departments"
  | "buildings"
  | "floors"
  | "rooms"
  | "vendors";

export type MasterDataStatus = "active" | "inactive" | "pending";

export interface MasterDataItem {
  id: string;
  name: string;
  code: string;
  status: MasterDataStatus;
  description?: string;
  facilityId?: string;
  buildingId?: string;
  floorId?: string;
  level?: string;
  category?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMasterDataInput {
  entity: MasterDataEntity;
  name: string;
  code?: string;
  status?: MasterDataStatus;
  description?: string;
  facilityId?: string;
  buildingId?: string;
  floorId?: string;
  level?: string;
  category?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export type UpdateMasterDataInput = Partial<
  Omit<CreateMasterDataInput, "entity">
> & {
  entity: MasterDataEntity;
  id: string;
};

export interface MasterDataListParams {
  entity: MasterDataEntity;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: MasterDataStatus | "all";
  facilityId?: string | "all";
  buildingId?: string | "all";
  floorId?: string | "all";
  category?: string | "all";
}

/** Lean location node for cascading Facility → Building → Floor → Room. */
export interface LocationCatalogItem {
  id: string;
  name: string;
  facilityId?: string;
  buildingId?: string;
  floorId?: string;
}

/** Flat location hierarchy returned by master-data/getLocationCatalog. */
export interface LocationCatalog {
  facilities: LocationCatalogItem[];
  buildings: LocationCatalogItem[];
  floors: LocationCatalogItem[];
  rooms: LocationCatalogItem[];
}

/** Client-side list sort — matches Assets/People toolbar pattern. */
export type MasterDataSort = "newest";

export type MasterDataModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; item: MasterDataItem }
  | { type: "view"; item: MasterDataItem }
  | { type: "deactivate"; item: MasterDataItem };
