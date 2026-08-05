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
}

export type MasterDataModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; item: MasterDataItem }
  | { type: "view"; item: MasterDataItem }
  | { type: "deactivate"; item: MasterDataItem };
