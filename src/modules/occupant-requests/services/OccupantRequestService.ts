import { RequestService } from "@/services/requests/RequestService";
import { getOccupantActor } from "../context/OccupantSession";
import { mapRequestToOccupantStatus } from "../status";
import type {
  IncidentRequestFormValues,
  MaintenanceRequestFormValues,
  OccupantActor,
  OccupantRequestResult,
} from "../types";
import {
  toCreateRequestFromIncidentForm,
  toCreateRequestFromMaintenanceForm,
} from "../utils";

/**
 * Client/helper path aligned with the live server-action intake boundary.
 * Creates REQ-* only — does not create Maintenance or Incident records.
 */
export const OccupantRequestService = {
  async submitMaintenanceRequest(
    form: MaintenanceRequestFormValues,
    actor: OccupantActor = getOccupantActor()
  ): Promise<OccupantRequestResult> {
    const created = await RequestService.createRequest(
      toCreateRequestFromMaintenanceForm(form, actor)
    );

    return {
      kind: "maintenance",
      id: created.id,
      title: created.title,
      status: mapRequestToOccupantStatus(created),
      facilityId: created.facilityId,
      createdAt: created.createdAt || created.occurredAt,
      requestType: "maintenance",
    };
  },

  async submitIncidentReport(
    form: IncidentRequestFormValues,
    actor: OccupantActor = getOccupantActor()
  ): Promise<OccupantRequestResult> {
    const created = await RequestService.createRequest(
      toCreateRequestFromIncidentForm(form, actor)
    );

    return {
      kind: "incident",
      id: created.id,
      title: created.title,
      status: mapRequestToOccupantStatus(created),
      facilityId: created.facilityId,
      createdAt: created.createdAt || created.occurredAt,
      requestType: "incident",
    };
  },
};
