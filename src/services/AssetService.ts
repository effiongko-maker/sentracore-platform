/**
 * Re-export the canonical AssetService from the API layer.
 * Keeps existing `@/services` / `@/services/AssetService` imports working.
 */
export {
  AssetService,
  type IAssetService,
} from "./assets/AssetService";
