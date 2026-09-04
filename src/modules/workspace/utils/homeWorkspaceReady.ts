/**
 * Lightweight coordination so the notification bell can defer its initial
 * feed fetch until Facility Management Home has settled — without coupling
 * notification loading into WorkspaceService.
 */

export const HOME_WORKSPACE_SETTLED_EVENT =
  "sentracore:home-workspace-settled";

export function isOperationsHomePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/operations" || pathname.startsWith("/operations/");
}

export function signalHomeWorkspaceSettled(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(HOME_WORKSPACE_SETTLED_EVENT));
  } catch {
    // ignore
  }
}
