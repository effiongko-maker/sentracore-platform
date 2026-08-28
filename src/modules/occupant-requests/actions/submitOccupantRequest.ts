"use server";

import { executeAction, type ActionResult } from "@/lib/actions";
import { RequestService } from "@/services/requests/RequestService";
import { getOccupantActor } from "../context/OccupantSession";
import { mapRequestToOccupantStatus } from "../status";
import type {
  IncidentRequestFormValues,
  MaintenanceRequestFormValues,
  OccupantRequestResult,
} from "../types";
import {
  toCreateRequestFromIncidentForm,
  toCreateRequestFromMaintenanceForm,
} from "../utils";

export async function submitOccupantMaintenanceRequest(
  form: MaintenanceRequestFormValues
): Promise<ActionResult<OccupantRequestResult>> {
  return executeAction({
    name: "occupant.maintenance.request",
    module: "facility_management",
    input: form,
    handler: async (context, rawInput) => {
      const actor = getOccupantActor();
      const input = toCreateRequestFromMaintenanceForm(rawInput, actor);

      const request = await RequestService.createRequest({
        ...input,
        createdByUserId: context.userId || input.createdByUserId,
        updatedByUserId: context.userId || input.updatedByUserId,
        reportedByUserId:
          input.reportedByUserId || context.userId || actor.id,
      });

      return {
        kind: "maintenance",
        id: request.id,
        title: request.title,
        status: mapRequestToOccupantStatus(request),
        facilityId: request.facilityId,
        createdAt: request.createdAt || request.occurredAt,
        requestType: "maintenance",
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
      const input = toCreateRequestFromIncidentForm(rawInput, actor);

      const request = await RequestService.createRequest({
        ...input,
        createdByUserId: context.userId || input.createdByUserId,
        updatedByUserId: context.userId || input.updatedByUserId,
        reportedByUserId:
          input.reportedByUserId || context.userId || actor.id,
      });

      return {
        kind: "incident",
        id: request.id,
        title: request.title,
        status: mapRequestToOccupantStatus(request),
        facilityId: request.facilityId,
        createdAt: request.createdAt || request.occurredAt,
        requestType: "incident",
      };
    },
  });
}
