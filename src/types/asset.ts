/**
 * Re-export Assets module types for shared consumers.
 * Prefer importing from `@/modules/assets` within the Assets feature.
 */
export type {
  Asset,
  AssetCategory,
  AssetCondition,
  AssetCriticality,
  AssetListParams,
  AssetStatus,
  CreateAssetInput,
  UpdateAssetInput,
} from "@/modules/assets/types";

export {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_CRITICALITIES,
  ASSET_FACILITIES,
  ASSET_STATUSES,
} from "@/modules/assets/constants";
