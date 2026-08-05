import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { getOccupantActor } from "../context/OccupantSession";
import {
  mapIncidentToOccupantStatus,
  mapMaintenanceToOccupantStatus,
} from "../status";
import type {
  IncidentRequestFormValues,
  MaintenanceRequestFormValues,
  OccupantActor,
  OccupantRequestResult,
} from "../types";
import { toCreateIncidentInput, toCreateMaintenanceInput } from "../utils";

/**
 * Thin orchestration over existing Maintenance / Incident domain services.
 * No duplicate persistence — requests become real Maintenance / Incident rows.
 */
export const OccupantRequestService = {
  async submitMaintenanceRequest(
    form: MaintenanceRequestFormValues,
    actor: OccupantActor = getOccupantActor()
  ): Promise<OccupantRequestResult> {
    const created = await MaintenanceService.createMaintenance(
      toCreateMaintenanceInput(form, actor)
    );

    return {
      kind: "maintenance",
      id: created.id,
      title: created.title,
      status: mapMaintenanceToOccupantStatus(created),
      facilityId: created.facilityId,
      createdAt: created.createdAt || created.reportedAt,
    };
  },

  async submitIncidentReport(
    form: IncidentRequestFormValues,
    actor: OccupantActor = getOccupantActor()
  ): Promise<OccupantRequestResult> {
    const created = await IncidentService.createIncident(
      toCreateIncidentInput(form, actor)
    );

    return {
      kind: "incident",
      id: created.id,
      title: created.title,
      status: mapIncidentToOccupantStatus(created),
      facilityId: created.facilityId,
      createdAt: created.createdAt || created.reportedAt,
    };
  },
};
