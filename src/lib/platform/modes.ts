import { resolveLayerByPath, type OperatingLayerId } from "@/lib/platform/layers";
import {
  isPlatformHomePath,
  isWorkspacePreviewPath,
} from "@/lib/platform/workspaces";

/** Canvas / atmosphere mode derived from operating layer. */
export type ProductMode =
  | "platform"
  | "command"
  | "understand"
  | "organise"
  | "act"
  | "execute"
  | "learn"
  | "cognitive";

export type ShellNavState = "compass" | "focus" | "cognitive" | "platform";

export const MODE_LABEL: Record<ProductMode, string> = {
  platform: "SentraCore",
  command: "Operations",
  understand: "Intelligence",
  organise: "Organisation",
  act: "Work",
  execute: "Operations",
  learn: "Insights",
  cognitive: "Intelligence",
};

export const MODE_DESCRIPTION: Record<ProductMode, string> = {
  platform: "Your organisation's operating environment",
  command: "Operations Management home",
  understand: "What the organisation is telling you",
  organise: "Facilities, assets, and people",
  act: "Requests and work in progress",
  execute: "Active operational events",
  learn: "What we've learned",
  cognitive: "Organisation intelligence",
};

function layerToMode(
  layer: OperatingLayerId | "command" | "platform"
): ProductMode {
  if (layer === "command") return "command";
  if (layer === "platform") return "platform";
  return layer;
}

/** Map route to product canvas mode. */
export function productModeFromPath(pathname: string): ProductMode {
  if (pathname.startsWith("/intelligence")) return "cognitive";
  if (isPlatformHomePath(pathname) || isWorkspacePreviewPath(pathname)) {
    return "platform";
  }
  return layerToMode(resolveLayerByPath(pathname));
}

/** @deprecated Use productModeFromPath */
export function productModeFromNav(
  _groupId: string | undefined,
  pathname: string
): ProductMode {
  return productModeFromPath(pathname);
}

export function shellNavStateForMode(mode: ProductMode): ShellNavState {
  if (mode === "cognitive") return "cognitive";
  if (mode === "platform") return "platform";
  return "compass";
}

export function isIntelligenceRoute(pathname: string): boolean {
  return pathname.startsWith("/intelligence");
}

export function isPlatformRoute(pathname: string): boolean {
  return isPlatformHomePath(pathname) || isWorkspacePreviewPath(pathname);
}
