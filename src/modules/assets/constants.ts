import type {
  AssetCategory,
  AssetCondition,
  AssetCriticality,
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

export const ASSET_CONDITIONS: AssetCondition[] = [
  "excellent",
  "good",
  "fair",
  "poor",
];

export const ASSET_CRITICALITIES: AssetCriticality[] = [
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
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const ASSETS_PAGE_SIZE = 8;
