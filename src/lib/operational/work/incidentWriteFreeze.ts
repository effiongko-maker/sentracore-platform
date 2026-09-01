import { ActionError } from "@/lib/actions/errors";

/** Phase 18 — new FM Incident creation is frozen. */
export const INCIDENT_WRITE_FREEZE_PHASE = 18 as const;

export const INCIDENT_CREATE_FROZEN_MESSAGE =
  "New Incident records cannot be created. Log an Issue to start Work instead.";

/**
 * Blocks normal FM orchestration paths that would create a new INC-* record.
 * Existing Incident updates and direct service calls are out of scope here.
 */
export function assertNewIncidentCreateAllowed(source: string): void {
  throw new ActionError("VALIDATION_ERROR", INCIDENT_CREATE_FROZEN_MESSAGE, {
    details: { source, phase: INCIDENT_WRITE_FREEZE_PHASE },
  });
}
