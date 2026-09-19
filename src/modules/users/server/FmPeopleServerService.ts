import "server-only";
import { ActionError } from "@/lib/actions/errors";
import { hasModule } from "@/lib/actions/moduleAccess";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import type { PlatformSession } from "@/lib/auth/types";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PaginatedResult } from "@/types";
import type { EligibleProfile, User } from "@/modules/users/types";
import {
  FM_PEOPLE_MODULE_SLUG,
  FmPeopleNotFoundError,
  FmPeopleUnavailableError,
  collapsePeopleByProfile,
  filterPeopleRows,
  mapDirectoryRowToUser,
  paginatePeople,
  parseCreateAssignmentInput,
  parsePeopleIdPayload,
  parsePeopleListParams,
  parseUpdateAssignmentInput,
} from "./fmPeopleDomain";
import { FmPeopleRepository } from "./FmPeopleRepository";

export type FmPeopleAccessContext = {
  session: PlatformSession;
  access: OperatingAccess;
  organisationId: string;
  profileId: string;
};

export function resolveFmPeopleOrganisation(
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
  if (!hasModule(session.enabledModules, FM_PEOPLE_MODULE_SLUG)) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }
  const profileId = session.profile.id;
  if (!profileId) {
    throw new ActionError("PROFILE_NOT_FOUND");
  }
  return { organisationId, profileId };
}

export class FmPeopleServerService {
  constructor(private readonly ctx: FmPeopleAccessContext) {}

  private repo() {
    return new FmPeopleRepository(this.ctx.organisationId);
  }

  async list(payload: unknown): Promise<PaginatedResult<User>> {
    const params = parsePeopleListParams(payload);
    const rows = await this.repo().listDirectoryRows();
    const mapped = collapsePeopleByProfile(rows.map(mapDirectoryRowToUser));
    const filtered = filterPeopleRows(mapped, params);
    const page = paginatePeople(filtered, params.page ?? 1, params.pageSize ?? 8);

    const { FmWorkRepository } = await import(
      "@/modules/maintenance/server/FmWorkRepository"
    );
    const workRepo = new FmWorkRepository(this.ctx.organisationId);
    const data: User[] = [];
    for (const user of page.data) {
      try {
        const count = await workRepo.countActiveForProfile(user.id);
        data.push({
          ...user,
          activeWorkOrders: count,
          workloadAvailable: true,
        });
      } catch {
        data.push({
          ...user,
          activeWorkOrders: 0,
          workloadAvailable: false,
        });
      }
    }
    return { ...page, data };
  }

  async listEligible(): Promise<EligibleProfile[]> {
    return this.repo().listEligibleProfiles();
  }

  async getById(payload: unknown): Promise<User> {
    const id = parsePeopleIdPayload(payload);
    const rows = await this.repo().getByProfileId(id);
    if (rows.length === 0) {
      throw new FmPeopleNotFoundError(`Person ${id} not found.`);
    }
    const user = collapsePeopleByProfile(rows.map(mapDirectoryRowToUser))[0]!;
    try {
      const { FmWorkRepository } = await import(
        "@/modules/maintenance/server/FmWorkRepository"
      );
      const count = await new FmWorkRepository(
        this.ctx.organisationId
      ).countActiveForProfile(user.id);
      return {
        ...user,
        activeWorkOrders: count,
        workloadAvailable: true,
      };
    } catch {
      return {
        ...user,
        activeWorkOrders: 0,
        workloadAvailable: false,
      };
    }
  }

  async create(payload: unknown): Promise<User> {
    const input = parseCreateAssignmentInput(payload);
    const created = await this.repo().createAssignment({
      profileId: input.profileId,
      facilityId: input.facilityId,
      role: input.role,
      status: input.status,
      actorProfileId: this.ctx.profileId,
    });
    const rows = await this.repo().getByProfileId(created.profile_id);
    const match = rows.find((row) => row.id === created.id) ?? rows[0];
    if (!match) {
      throw new FmPeopleUnavailableError(
        "Assignment was created but could not be re-read."
      );
    }
    return mapDirectoryRowToUser(match);
  }

  async update(payload: unknown): Promise<User> {
    const input = parseUpdateAssignmentInput(payload);
    const rows = await this.repo().getByProfileId(input.id);
    if (rows.length === 0) {
      throw new FmPeopleNotFoundError(`Person ${input.id} not found.`);
    }
    const target =
      rows.find((row) => row.id === input.assignmentId) ??
      rows.find((row) => row.facility_id === input.facilityId) ??
      rows[0]!;
    await this.repo().updateAssignment(
      target.id,
      {
        facilityId: input.facilityId,
        role: input.role,
        status: input.status,
      },
      this.ctx.profileId
    );
    const next = await this.repo().getByProfileId(input.id);
    const match = next.find((row) => row.id === target.id) ?? next[0];
    if (!match) {
      throw new FmPeopleNotFoundError(`Person ${input.id} not found.`);
    }
    return mapDirectoryRowToUser(match);
  }

  async deactivate(payload: unknown): Promise<User> {
    const id = parsePeopleIdPayload(payload);
    const updated = await this.repo().deactivateProfileAssignments(
      id,
      this.ctx.profileId
    );
    const rows = await this.repo().getByProfileId(id);
    const match = rows.find((row) => row.id === updated[0]?.id) ?? rows[0];
    if (!match) {
      throw new FmPeopleNotFoundError(`Person ${id} not found.`);
    }
    return mapDirectoryRowToUser(match);
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(payload);
      case "listEligible":
      case "listEligibleProfiles":
        return this.listEligible();
      case "getById":
        return this.getById(payload);
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError(
          "VALIDATION_ERROR",
          `Unknown users action: ${action}`
        );
    }
  }
}
