import type { MasterDataEntity, MasterDataSort, MasterDataStatus } from "./types";

export const MASTER_DATA_ENTITIES: Array<{
  id: MasterDataEntity;
  label: string;
  description: string;
}> = [
  {
    id: "departments",
    label: "Departments",
    description: "Organizational departments used on requests and work",
  },
  {
    id: "buildings",
    label: "Buildings",
    description: "Buildings within a facility",
  },
  {
    id: "floors",
    label: "Floors",
    description: "Floor levels within a building",
  },
  {
    id: "rooms",
    label: "Rooms",
    description: "Rooms and spaces within a floor",
  },
  {
    id: "vendors",
    label: "Vendors",
    description: "External vendors and service providers",
  },
];

export const MASTER_DATA_STATUSES: MasterDataStatus[] = [
  "active",
  "pending",
  "inactive",
];

export const MASTER_DATA_PAGE_SIZE = 10;

export const MASTER_DATA_STATUS_VARIANT: Record<
  MasterDataStatus,
  "success" | "warning" | "neutral"
> = {
  active: "success",
  pending: "warning",
  inactive: "neutral",
};

export const VENDOR_CATEGORIES = [
  "HVAC",
  "Electrical",
  "Plumbing",
  "Fire & Safety",
  "Cleaning",
  "Security",
  "IT",
  "General",
] as const;

export const MASTER_DATA_SORT_OPTIONS: Array<{
  value: MasterDataSort;
  label: string;
}> = [{ value: "newest", label: "Newest" }];

export const DEFAULT_MASTER_DATA_SORT: MasterDataSort = "newest";

export function entityNoun(entity: MasterDataEntity): {
  singular: string;
  plural: string;
} {
  switch (entity) {
    case "departments":
      return { singular: "department", plural: "departments" };
    case "buildings":
      return { singular: "building", plural: "buildings" };
    case "floors":
      return { singular: "floor", plural: "floors" };
    case "rooms":
      return { singular: "room", plural: "rooms" };
    case "vendors":
      return { singular: "vendor", plural: "vendors" };
  }
}
