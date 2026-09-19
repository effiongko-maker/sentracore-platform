import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PlatformSession } from "@/lib/auth/types";
import { assertNewIncidentCreateAllowed } from "@/lib/operational/work/incidentWriteFreeze";
import type { PaginatedResult } from "@/types";
import type { Incident, IncidentListParams } from "@/modules/incidents/types";
import { resolveFmWorkOrganisation } from "@/modules/maintenance/server/FmWorkServerService";
import {
  FmIncidentNotFoundError,
  mapFmIncidentRowToIncident,
  paginateIncidentRows,
  parseCreateIncidentInput,
  parseIncidentIdPayload,
  parseIncidentListParams,
  parseUpdateIncidentInput,
  type FmIncidentRow,
} from "./fmIncidentDomain";
import { FmIncidentRepository } from "./FmIncidentRepository";

export type FmIncidentAccessContext = {
  organisationId: string;
  profileId: string;
  session?: PlatformSession;
  access?: OperatingAccess;
};

export function resolveFmIncidentOrganisation(session: PlatformSession): {
  organisationId: string;
  profileId: string;
} {
  return resolveFmWorkOrganisation(session);
}

export class FmIncidentServerService {
  constructor(private readonly ctx: FmIncidentAccessContext) {}

  private repo() {
    return new FmIncidentRepository(this.ctx.organisationId);
  }

  private async hydrate(rows: FmIncidentRow[]): Promise<Incident[]> {
    const relations = await this.repo().relationsFor(rows);
    return rows.map((row) => mapFmIncidentRowToIncident(row, relations.get(row.id)));
  }

  async list(params: IncidentListParams = {}): Promise<PaginatedResult<Incident>> {
    const parsed = parseIncidentListParams(params);
    const { rows, total } = await this.repo().listPage(parsed);
    return paginateIncidentRows(
      await this.hydrate(rows),
      total,
      parsed.page ?? 1,
      parsed.pageSize ?? 8
    );
  }

  async getById(idOrCode: string): Promise<Incident> {
    const found = await this.findById(idOrCode);
    if (!found) throw new FmIncidentNotFoundError(`Incident ${idOrCode} not found.`);
    return found;
  }

  /** Null when absent — for callers where "not found" is a normal outcome. */
  async findById(idOrCode: string): Promise<Incident | null> {
    const row = await this.repo().getByIdOrCode(idOrCode);
    return row ? (await this.hydrate([row]))[0]! : null;
  }

  /**
   * New Incident creation is frozen at the product layer (Phase 18).
   * Lifting the freeze is one deliberate edit to assertNewIncidentCreateAllowed.
   */
  async create(payload: unknown): Promise<Incident> {
    assertNewIncidentCreateAllowed("FmIncidentServerService.create");
    const input = parseCreateIncidentInput(payload);
    const row = await this.repo().create(input, this.ctx.profileId);
    return (await this.hydrate([row]))[0]!;
  }

  async update(
    payload: unknown
  ): Promise<{ incident: Incident; previousStatus: string }> {
    const input = parseUpdateIncidentInput(payload);
    const { row, previousStatus } = await this.repo().update(input, this.ctx.profileId);
    return { incident: (await this.hydrate([row]))[0]!, previousStatus };
  }

  async deactivate(payload: unknown): Promise<Incident> {
    const id = parseIncidentIdPayload(payload);
    return (await this.update({ id, status: "cancelled" })).incident;
  }

  async countActiveForProfile(profileId: string): Promise<number> {
    return this.repo().countActiveForProfile(profileId);
  }

  async activeByAssetIds(assetIds: string[]): Promise<Map<string, string[]>> {
    return this.repo().activeByAssetIds(assetIds);
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(parseIncidentListParams(payload));
      case "getById":
        return this.getById(parseIncidentIdPayload(payload));
      case "create":
        return this.create(payload);
      case "update":
        return (await this.update(payload)).incident;
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError("VALIDATION_ERROR", `Unknown incidents action: ${action}`);
    }
  }
}
