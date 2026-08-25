import type {
  AssetCategory,
  AssetCondition,
  AssetCriticality,
  AssetSort,
  AssetStatus,
} from "./types";

export const ASSET_CATEGORIES: AssetCategory[] = [
  "hvac",
  "power",
  "electrical",
  "mechanical",
  "vertical_transport",
  "fire_safety",
  "it",
  "other",
];

export const ASSET_STATUSES: AssetStatus[] = [
  "active",
  "pending",
  "inactive",
  "suspended",
];

/** Statuses shown in the Assets list filter popover. */
export const ASSET_FILTER_STATUSES: AssetStatus[] = [
  "active",
  "inactive",
  "pending",
];

export const ASSET_CONDITIONS: AssetCondition[] = [
  "excellent",
  "good",
  "fair",
  "poor",
];

export const ASSET_CRITICALITIES: AssetCriticality[] = [
  "unassessed",
  "low",
  "medium",
  "high",
  "critical",
];

export const ASSET_STATUS_VARIANT: Record<
  AssetStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  inactive: "neutral",
};

export const ASSET_CRITICALITY_VARIANT: Record<
  AssetCriticality,
  "neutral" | "info" | "warning" | "danger"
> = {
  unassessed: "neutral",
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const ASSETS_PAGE_SIZE = 8;

export const ASSET_SORT_OPTIONS: Array<{ value: AssetSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name_asc", label: "Name: A–Z" },
  { value: "name_desc", label: "Name: Z–A" },
];

export const DEFAULT_ASSET_SORT: AssetSort = "newest";
