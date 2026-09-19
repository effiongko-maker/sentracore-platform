import "server-only";
import type { PaginatedResult } from "@/types";
import type {
  CreateIncidentInput,
  Incident,
  IncidentListParams,
  UpdateIncidentInput,
} from "@/modules/incidents/types";
import { applyWorkOrderRule } from "@/modules/incidents/utils";
import { onIncidentMutation } from "@/services/cache/domainCache";
import { getFmIncidentServerService } from "./getFmIncidentServerService";

/**
 * Server-only Incident persistence for Action Engine / orchestration.
 * Supabase (fm_incidents) is the single source of truth — never Apps Script.
 *
 * Browser code must use `@/services/incidents/IncidentService`
 * (apiClient → /api/incidents) instead.
 */
export const IncidentServerAccess = {
  async listIncidents(params: IncidentListParams = {}): Promise<PaginatedResult<Incident>> {
    return (await getFmIncidentServerService()).list(params);
  },

  async getIncident(idOrCode: string): Promise<Incident | null> {
    return (await getFmIncidentServerService()).findById(idOrCode);
  },

  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const created = await (await getFmIncidentServerService()).create(applyWorkOrderRule(input));
    onIncidentMutation();
    return created;
  },

  async updateIncident(idOrCode: string, input: UpdateIncidentInput): Promise<Incident> {
    return (await IncidentServerAccess.updateIncidentWithMeta(idOrCode, input)).entity;
  },

  async updateIncidentWithMeta(
    idOrCode: string,
    input: UpdateIncidentInput
  ): Promise<{ entity: Incident; previousStatus: string }> {
    const service = await getFmIncidentServerService();
    const { incident, previousStatus } = await service.update(
      applyWorkOrderRule({ ...input, id: idOrCode })
    );
    onIncidentMutation();
    return { entity: incident, previousStatus };
  },

  async countActiveForProfile(profileId: string): Promise<number> {
    return (await getFmIncidentServerService()).countActiveForProfile(profileId);
  },
};
