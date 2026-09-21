import type { ModuleBoundary } from "@/lib/access/moduleBoundary";
import { homeRouteForBoundary } from "@/lib/access/moduleBoundary";
import { LANDING_OPTIONS, LANDING_SELECTABLE_IDS, type LandingId } from "@/lib/access/workspaceRegistry";
import type { WorkspaceAccessChrome } from "@/lib/access/workspaceAccessChrome";

/**
 * Landing workspace — a UX ROUTING PREFERENCE for platform-scope identities.
 *
 *   ACCESS BOUNDARY   (access_scope / home_module) = where an identity may operate
 *   LANDING WORKSPACE (this)                       = where a platform-scope identity prefers to begin
 *
 * It is never authority: it grants nothing, enables nothing and bypasses no gate. It is
 * honoured only when the workspace is CURRENTLY enterable for the identity (same chrome
 * flags the switcher uses); otherwise the neutral Platform Home is shown.
 */

export const LANDING_WORKSPACES = LANDING_SELECTABLE_IDS;
export type LandingWorkspace = LandingId;

export const LANDING_WORKSPACE_ROUTE = Object.fromEntries(
  LANDING_OPTIONS.map((w) => [w.id, w.route])
) as Record<LandingWorkspace, string>;

export const LANDING_WORKSPACE_LABEL = Object.fromEntries(
  LANDING_OPTIONS.map((w) => [w.id, w.label])
) as Record<LandingWorkspace, string>;

const CHROME_FLAG: Record<LandingWorkspace, keyof WorkspaceAccessChrome> = {
  command_centre: "commandCentre",
  facility_management: "facilityManagement",
  ecc_operations: "eccOperations",
  platform_finance: "platformFinance",
};

export function isLandingWorkspace(value: unknown): value is LandingWorkspace {
  return typeof value === "string" && (LANDING_WORKSPACES as readonly string[]).includes(value);
}

/** Where an entry (login / bare root visit) should send a platform-scope identity, or null for Platform Home. */
export function resolveLandingRoute(input: {
  boundary: ModuleBoundary;
  landingWorkspace: string | null | undefined;
  /** Null when the workspace flags could not be resolved — fails to Platform Home. */
  chrome: WorkspaceAccessChrome | null;
}): string | null {
  const { boundary, landingWorkspace, chrome } = input;
  // Module-bound identities are governed solely by home_module; a preference can never move them.
  if (!boundary.valid || boundary.scope !== "platform") return null;
  if (!isLandingWorkspace(landingWorkspace) || !chrome) return null;
  return chrome[CHROME_FLAG[landingWorkspace]] ? LANDING_WORKSPACE_ROUTE[landingWorkspace] : null;
}

/**
 * Only an ENTRY (no referrer, or arriving from the auth pages) triggers a landing redirect.
 * In-app navigation to "/" (Platform Home links, "Return to Platform Home") always shows
 * Platform Home, so a preference can neither loop nor make Platform Home unreachable.
 */
export function isEntryNavigation(referer: string | null | undefined): boolean {
  if (!referer) return true;
  try {
    const path = new URL(referer).pathname;
    return /^\/(login|auth|reset-password|forgot-password)(\/|$)/.test(path);
  } catch {
    return true;
  }
}

export { homeRouteForBoundary };
