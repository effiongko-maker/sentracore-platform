"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import {
  orchestrateTriageIncident,
  type TriageIncidentInput,
  type TriageIncidentResult,
} from "@/lib/operational/orchestration";

export async function triageIncident(
  input: TriageIncidentInput
): Promise<ActionResult<TriageIncidentResult>> {
  return executeAction({
    name: "incident.triage",
    module: "facility_management",
    requiredCapability: "ops.edit",
    input,
    handler: async (context, rawInput) => {
      if (!rawInput.incidentId?.trim()) {
        throw new ActionError("VALIDATION_ERROR", "Incident ID is required.");
      }
      if (!rawInput.response) {
        throw new ActionError("VALIDATION_ERROR", "Triage response is required.");
      }

      return orchestrateTriageIncident({
        input: rawInput,
        context,
      });
    },
  });
}
