"use server";

import { executeAction, type ActionResult } from "@/lib/actions";
import type { ActionContext } from "@/lib/actions";
import { FmRequestServerService } from "@/modules/requests/server/FmRequestServerService";
import {
  assertPortalFacility,
  loadOccupantPortalTarget,
} from "@/modules/requests/server/occupantPortalTarget";
import { onRequestMutation } from "@/services/cache/domainCache";
import type { CreateRequestInput } from "@/modules/requests/types";
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

/**
 * Occupant intake writes Supabase (fm_requests) through the same server
 * service as /api/requests. The tenant is the configured portal facility's
 * organisation — never client-supplied. Anonymous submissions record no
 * profile; a signed-in person of that organisation is recorded as reporter.
 */
async function createPortalRequest(
  context: ActionContext,
  input: CreateRequestInput
) {
  const target = await loadOccupantPortalTarget();
  assertPortalFacility(target, input.facilityId);

  const profileId =
    context.profile.id && context.organisation.id === target.organisationId
      ? context.profile.id
      : null;

  const service = new FmRequestServerService({
    organisationId: target.organisationId,
    profileId,
  });
  const request = await service.create({
    ...input,
    facilityId: target.facilityId,
    // Actor identity is derived from the session, never from the payload.
    reportedByUserId: profileId ?? undefined,
    createdByUserId: undefined,
    updatedByUserId: undefined,
    status: "submitted",
  });
  onRequestMutation();
  return request;
}

export async function submitOccupantMaintenanceRequest(
  form: MaintenanceRequestFormValues
): Promise<ActionResult<OccupantRequestResult>> {
  return executeAction({
    name: "occupant.maintenance.request",
    module: "facility_management",
    requiredCapability: "requests.view",
    allowAnonymous: true,
    input: form,
    handler: async (context, rawInput) => {
      const actor = getOccupantActor();
      const input = toCreateRequestFromMaintenanceForm(rawInput, actor);

      const request = await createPortalRequest(context, input);

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
    requiredCapability: "requests.view",
    allowAnonymous: true,
    input: form,
    handler: async (context, rawInput) => {
      const actor = getOccupantActor();
      const input = toCreateRequestFromIncidentForm(rawInput, actor);

      const request = await createPortalRequest(context, input);

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
