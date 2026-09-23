import "server-only";
import { hasModule } from "@/lib/actions/moduleAccess";
import { ActionError } from "@/lib/actions/errors";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import type { PlatformSession } from "@/lib/auth/types";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PaginatedResult } from "@/types";
import type { Facility, FacilityListParams } from "@/modules/facilities/types";
import {
  FM_FACILITY_MODULE_SLUG,
  FmFacilityNotFoundError,
  filterFacilityRows,
  paginateRows,
  parseCreateFacilityInput,
  parseFacilityIdPayload,
  parseFacilityListParams,
  parseUpdateFacilityInput,
  mapFmFacilityRowToApi,
} from "./fmFacilityDomain";
import { FmFacilitiesRepository } from "./FmFacilitiesRepository";

export type FmFacilitiesAccessContext = {
  session: PlatformSession;
  access: OperatingAccess;
  organisationId: string;
  profileId: string;
};

export function resolveFmFacilitiesOrganisation(
  session: PlatformSession
): { organisationId: string; profileId: string } {
  assertActiveProfileForBusinessAccess(session);

  const organisationId =
    session.organisation?.id ?? session.profile.organisationId ?? null;
  if (!organisationId) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }
  if (session.organisation && session.organisation.status !== "active") {
    throw new ActionError("ORGANISATION_INACTIVE");
  }
  if (!hasModule(session.enabledModules, FM_FACILITY_MODULE_SLUG)) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }
  const profileId = session.profile.id;
  if (!profileId) {
    throw new ActionError("PROFILE_NOT_FOUND");
  }
  return { organisationId, profileId };
}

export class FmFacilitiesServerService {
  constructor(private readonly ctx: FmFacilitiesAccessContext) {}

  private repo() {
    return new FmFacilitiesRepository(this.ctx.organisationId);
  }

  async list(params: FacilityListParams = {}): Promise<PaginatedResult<Facility>> {
    const parsed = parseFacilityListParams(params);
    const repo = this.repo();
    const [rows, assigned] = await Promise.all([repo.listRows(), repo.assignedPeopleCounts()]);
    const mapped = rows.map((row) => ({ ...mapFmFacilityRowToApi(row), assignedPeople: assigned.get(row.id) ?? 0 }));
    const filtered = filterFacilityRows(mapped, parsed);
    return paginateRows(
      filtered,
      parsed.page ?? 1,
      parsed.pageSize ?? 8
    );
  }

  async getById(id: string): Promise<Facility> {
    const row = await this.repo().getByIdOrCode(id);
    if (!row) {
      throw new FmFacilityNotFoundError(`Facility ${id} not found.`);
    }
    return mapFmFacilityRowToApi(row);
  }

  async create(payload: unknown): Promise<Facility> {
    const input = parseCreateFacilityInput(payload);
    const row = await this.repo().create(input, this.ctx.profileId);
    return mapFmFacilityRowToApi(row);
  }

  async update(payload: unknown): Promise<Facility> {
    const input = parseUpdateFacilityInput(payload);
    const row = await this.repo().update(
      input.id,
      input,
      this.ctx.profileId
    );
    return mapFmFacilityRowToApi(row);
  }

  async deactivate(payload: unknown): Promise<Facility> {
    const id = parseFacilityIdPayload(payload);
    const row = await this.repo().deactivate(id, this.ctx.profileId);
    return mapFmFacilityRowToApi(row);
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(parseFacilityListParams(payload));
      case "getById":
        return this.getById(parseFacilityIdPayload(payload));
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError(
          "VALIDATION_ERROR",
          `Unknown facilities action: ${action}`
        );
    }
  }
}
