export type FacilityStatus = "active" | "inactive" | "pending" | "suspended";

export type FacilityType =
  | "headquarters"
  | "campus"
  | "plant"
  | "warehouse"
  | "hub"
  | "office";

export interface Facility {
  id: string;
  name: string;
  code: string;
  location: string;
  type: FacilityType;
  manager: string;
  status: FacilityStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFacilityInput {
  name: string;
  code: string;
  location: string;
  type: FacilityType;
  manager: string;
  status: FacilityStatus;
  description?: string;
}

export type UpdateFacilityInput = Partial<CreateFacilityInput>;

export interface FacilityListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: FacilityStatus | "all";
  type?: FacilityType | "all";
  location?: string | "all";
}

export type FacilityModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; facility: Facility }
  | { type: "view"; facility: Facility }
  | { type: "deactivate"; facility: Facility };
