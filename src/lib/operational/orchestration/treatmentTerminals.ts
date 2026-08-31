/**
 * Pure successful-terminal checks for Request auto-resolution and Issue lenses.
 * Keep free of server-only imports so client Issue UI can reuse the same semantics.
 */

/** Status-authoritative successful terminal for Maintenance treatments. */
export function isMaintenanceSuccessfullyTerminal(status: string): boolean {
  return status === "completed";
}

/** Status-authoritative successful terminal for Incident treatments. */
export function isIncidentSuccessfullyTerminal(status: string): boolean {
  return status === "resolved";
}
