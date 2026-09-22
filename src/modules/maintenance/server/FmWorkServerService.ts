import "server-only";
import { hasModule } from "@/lib/actions/moduleAccess";
import { ActionError } from "@/lib/actions/errors";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import type { PlatformSession } from "@/lib/auth/types";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PaginatedResult } from "@/types";
import type {
  Maintenance,
  MaintenanceCatalogEntry,
  MaintenanceListParams,
} from "@/modules/maintenance/types";
import {
  FM_WORK_MODULE_SLUG,
  FmWorkNotFoundError,
  countCriticalWork,
  filterWorkRows,
  mapFmWorkRowToCatalog,
  mapFmWorkRowToMaintenance,
  paginateWorkRows,
  parseCreateWorkInput,
  parseUpdateWorkInput,
  parseWorkIdPayload,
  parseWorkListParams,
  sortWorkRows,
  summarizeWorkOperationalPicture,
} from "./fmWorkDomain";
import { FmWorkRepository } from "./FmWorkRepository";

export type FmWorkAccessContext = {
  session: PlatformSession;
  access: OperatingAccess;
  organisationId: string;
  profileId: string;
};

export function resolveFmWorkOrganisation(
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
  if (!hasModule(session.enabledModules, FM_WORK_MODULE_SLUG)) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }
  const profileId = session.profile.id;
  if (!profileId) {
    throw new ActionError("PROFILE_NOT_FOUND");
  }
  return { organisationId, profileId };
}

export class FmWorkServerService {
  constructor(private readonly ctx: FmWorkAccessContext) {}

  private repo() {
    return new FmWorkRepository(this.ctx.organisationId);
  }

  async list(
    params: MaintenanceListParams = {}
  ): Promise<
    PaginatedResult<Maintenance> & {
      criticalWorkTotal?: number;
      operationalPictureMaintenance?: ReturnType<
        typeof summarizeWorkOperationalPicture
      >;
      maintenanceUnrecordedTotal?: number;
    }
  > {
    const parsed = parseWorkListParams(params);
    const rows = await this.repo().listRows();
    const mapped = rows.map(mapFmWorkRowToMaintenance);
    const filtered = filterWorkRows(mapped, parsed);
    const sorted = sortWorkRows(filtered, parsed.sort);
    const page = paginateWorkRows(
      sorted,
      parsed.page ?? 1,
      parsed.pageSize ?? 8
    );

    const result: PaginatedResult<Maintenance> & {
      criticalWorkTotal?: number;
      operationalPictureMaintenance?: ReturnType<
        typeof summarizeWorkOperationalPicture
      >;
      maintenanceUnrecordedTotal?: number;
    } = { ...page, operationalPictureMaintenance: undefined };

    if (parsed.includeOperationalPictureTotals) {
      const asOf = parsed.asOf?.trim() || new Date().toISOString();
      // Complete register — unfiltered mapped rows, not the page slice.
      result.operationalPictureMaintenance = summarizeWorkOperationalPicture(
        mapped,
        asOf
      );
      result.criticalWorkTotal =
        result.operationalPictureMaintenance.critical;
      // Complete-register count of Work with no recorded lifecycle status (migrated
      // historical) — distinct from and never counted toward criticalWorkTotal/open.
      // Lets Home show "N historical records" instead of a bare, unexplained zero.
      result.maintenanceUnrecordedTotal = mapped.filter(
        (row) => row.status === "unknown"
      ).length;
    } else if (parsed.includeCriticalWorkTotal) {
      result.criticalWorkTotal = countCriticalWork(filtered);
    }

    return result;
  }

  async listCatalog(payload: unknown): Promise<
    PaginatedResult<MaintenanceCatalogEntry>
  > {
    const raw =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const search = String(raw.search ?? "")
      .toLowerCase()
      .trim();
    const page = Math.max(1, Number(raw.page ?? 1) || 1);
    const pageSize = Math.max(1, Number(raw.pageSize ?? 500) || 500);
    const rows = await this.repo().listRows();
    let catalog = rows.map(mapFmWorkRowToCatalog);
    if (search) {
      catalog = catalog.filter(
        (row) =>
          row.id.toLowerCase().includes(search) ||
          row.title.toLowerCase().includes(search)
      );
    }
    return paginateWorkRows(catalog, page, pageSize);
  }

  async getById(id: string): Promise<Maintenance> {
    const row = await this.repo().getByIdOrCode(id);
    if (!row) {
      throw new FmWorkNotFoundError(`Work ${id} not found.`);
    }
    return mapFmWorkRowToMaintenance(row);
  }

  async create(payload: unknown): Promise<Maintenance> {
    const input = parseCreateWorkInput(payload);
    const row = await this.repo().create(input, this.ctx.profileId);
    return mapFmWorkRowToMaintenance(row);
  }

  async update(
    payload: unknown
  ): Promise<Maintenance & { _previousStatus?: string }> {
    const input = parseUpdateWorkInput(payload);
    const { row, previousStatus } = await this.repo().update(
      input.id,
      input,
      this.ctx.profileId
    );
    return {
      ...mapFmWorkRowToMaintenance(row),
      _previousStatus: previousStatus,
    };
  }

  async deactivate(payload: unknown): Promise<Maintenance> {
    const id = parseWorkIdPayload(payload);
    const row = await this.repo().deactivate(id, this.ctx.profileId);
    return mapFmWorkRowToMaintenance(row);
  }

  async countActiveForProfile(profileId: string): Promise<number> {
    return this.repo().countActiveForProfile(profileId);
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(parseWorkListParams(payload));
      case "listCatalog":
        return this.listCatalog(payload);
      case "getById":
        return this.getById(parseWorkIdPayload(payload));
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError(
          "VALIDATION_ERROR",
          `Unknown maintenance action: ${action}`
        );
    }
  }
}
