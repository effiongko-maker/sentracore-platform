/**
 * Re-export the canonical AssetService from the API layer.
 * Module components keep importing from here — no UI changes required.
 */
export {
  AssetService,
  type IAssetService,
} from "@/services/assets/AssetService";
