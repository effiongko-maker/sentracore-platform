/**
 * Lightweight coordination so the notification bell can defer its initial
 * feed fetch until Facility Management Home has settled — without coupling
 * notification loading into WorkspaceService.
 *
 * On /operations, bell waits for:
 *   1) Workspace core settle (LoadingGate / first paint)
 *   2) Home Finance Position settle (or skip when Finance is not shown)
 * so notification list fan-out does not starve Finance requests.
 */

export const HOME_WORKSPACE_SETTLED_EVENT =
  "sentracore:home-workspace-settled";

export const HOME_FINANCE_SETTLED_EVENT =
  "sentracore:home-finance-settled";

let homeFinanceSettled = false;

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

/** Reset when entering /operations so a prior visit cannot release the bell early. */
export function resetHomeFinanceSettled(): void {
  homeFinanceSettled = false;
}

export function isHomeFinanceSettled(): boolean {
  return homeFinanceSettled;
}

/**
 * Marks Home Finance Position as settled (success, partial, total failure, or
 * intentionally skipped). Idempotent for the current /operations visit.
 */
export function signalHomeFinanceSettled(): void {
  if (typeof window === "undefined") return;
  homeFinanceSettled = true;
  try {
    window.dispatchEvent(new Event(HOME_FINANCE_SETTLED_EVENT));
  } catch {
    // ignore
  }
}
