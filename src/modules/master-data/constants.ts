import type { MasterDataEntity, MasterDataStatus } from "./types";

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
