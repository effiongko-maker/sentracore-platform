"use server";

import { executeAction, type ActionResult } from "@/lib/actions";
import {
  orchestrateReportIncident,
  orchestrateRequestMaintenance,
} from "@/lib/operational/orchestration";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import { getOccupantActor } from "../context/OccupantSession";
import {
  mapIncidentToOccupantStatus,
  mapMaintenanceToOccupantStatus,
} from "../status";
import type {
  IncidentRequestFormValues,
  MaintenanceRequestFormValues,
  OccupantRequestResult,
} from "../types";
import { toCreateIncidentInput, toCreateMaintenanceInput } from "../utils";

export async function submitOccupantMaintenanceRequest(
  form: MaintenanceRequestFormValues
): Promise<ActionResult<OccupantRequestResult>> {
  return executeAction({
    name: "occupant.maintenance.request",
    module: "facility_management",
    input: form,
    handler: async (context, rawInput) => {
      const actor = getOccupantActor();
      const input = toCreateMaintenanceInput(rawInput, actor);

      const maintenance = await orchestrateRequestMaintenance({
        input: {
          ...input,
          createdByUserId: context.userId,
          updatedByUserId: context.userId,
          reportedByUserId: input.reportedByUserId || context.userId,
        },
        intake: "occupant",
        context,
        sourceReference: "occupant_request",
      });

      return {
        kind: "maintenance",
        id: maintenance.id,
        title: maintenance.title,
        status: mapMaintenanceToOccupantStatus(maintenance),
        facilityId: maintenance.facilityId,
        createdAt: maintenance.createdAt || maintenance.reportedAt,
      };
    },
  });
}

export async function submitOccupantIncidentReport(
  form: IncidentRequestFormValues
): Promise<ActionResult<OccupantRequestResult>> {
  return executeAction({
    name: "occupant.incident.report",
    module: "facility_management",
    input: form,
    handler: async (context, rawInput) => {
      const actor = getOccupantActor();
      const input = toCreateIncidentInput(rawInput, actor);

      const incident = await orchestrateReportIncident({
        input: {
          ...input,
          createdByUserId: context.userId,
          updatedByUserId: context.userId,
          reportedByUserId: input.reportedByUserId || context.userId,
        },
        intake: "occupant",
        context,
        sourceReference: "occupant_request",
      });

      return {
        kind: "incident",
        id: incident.id,
        title: incident.title,
        status: mapIncidentToOccupantStatus(incident),
        facilityId: incident.facilityId,
        createdAt: incident.createdAt || incident.reportedAt,
      };
    },
  });
}

export type { Incident, Maintenance };
