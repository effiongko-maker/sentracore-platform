/**
 * Phase 23 — Request treatment UI incident retirement context.
 *
 * Canonical FM treatment: Request → Create Work / Link Work
 * Legacy: historical Incident relationships on existing Requests remain readable.
 */

export const REQUEST_TREATMENT_OPERATIONAL_CONTEXT = {
  canonicalCreateAction: "create-work",
  canonicalLinkAction: "link-work",
  canonicalWorkBacking: "maintenance",
  legacyIncidentCreateRetiredFromUi: true,
  legacyIncidentLinkRetiredFromUi: true,
  note: "FM operators treat Requests via Work only; Incident create/link removed from treatment UX.",
} as const;

export const REQUEST_INCIDENT_UI_RETIREMENT_PHASE = 23 as const;

export const REQUEST_INCIDENT_UI_COMPAT = [
  "createIncidentFromRequest (guarded orchestrator)",
  "orchestrateCreateIncidentFromRequest (Phase 18 freeze)",
  "linkIncidentToRequest (historical compatibility API)",
  "orchestrateLinkIncidentToRequest",
  "ViewRequestModal legacy incident read-only section",
  "incidentIds on existing Request records",
] as const;
