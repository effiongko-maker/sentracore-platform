"use server";

import {
  actionFailureFromError,
  actionSuccess,
  type ActionResult,
} from "@/lib/actions";
import {
  getIncidentIntelligence,
  type EventIntelligence,
} from "@/lib/intelligence";

/**
 * UI-facing bridge: incidentId → getIncidentIntelligence.
 * Read-only. Does not query intelligence tables or duplicate load logic.
 */
export async function fetchIncidentIntelligence(
  incidentId: string
): Promise<ActionResult<EventIntelligence>> {
  try {
    const data = await getIncidentIntelligence(incidentId);
    return actionSuccess(data);
  } catch (error) {
    return actionFailureFromError(error);
  }
}
