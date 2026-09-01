/**
 * Phase 22 — Incident navigation retirement context.
 *
 * LIVE FM navigation: Issues → Work → Work Orders
 * LEGACY: /incidents deep links for historical records only
 */

export const NAVIGATION_OPERATIONAL_CONTEXT = {
  canonicalIssueSurface: "/issues",
  canonicalWorkSurface: "/work",
  canonicalWorkOrderSurface: "/work-orders",
  legacyIncidentSurface: "/incidents",
  note: "Incident removed from primary FM navigation; /incidents remains for historical compatibility.",
} as const;

export const INCIDENT_NAVIGATION_RETIREMENT_PHASE = 22 as const;

export const PRIMARY_FM_NAV_SURFACES = [
  "/issues",
  "/work",
  "/work-orders",
  "/approvals",
] as const;

export const INCIDENT_NAV_COMPAT = [
  "SECONDARY_NAV_ITEMS legacy incidents entry",
  "LEGACY_LAYER_MODULES for /incidents breadcrumb resolution",
  "ARCHETYPE_BY_HREF /incidents operational-list",
  "isOperationsPath includes /incidents",
  "deep links /incidents?id=INC-*",
  "Intelligence legacy incidents links",
  "Request → Incident compatibility modals",
] as const;
