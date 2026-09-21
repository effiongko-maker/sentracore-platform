import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { migratedHistoricalIds, originOf } from "@/lib/migration/historicalOrigin";
import { ActionError } from "@/lib/actions/errors";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PlatformSession } from "@/lib/auth/types";
import type { PaginatedResult } from "@/types";
import type { Asset } from "@/modules/assets/types";
import { resolveFmWorkOrganisation } from "@/modules/maintenance/server/FmWorkServerService";
import {
  FmAssetNotFoundError,
  mapFmAssetRow,
  paginateRows,
  parseAssetIdPayload,
  parseAssetListParams,
  parseCreateAssetInput,
  parseUpdateAssetInput,
  type FmAssetRow,
} from "./fmAssetDomain";
import { FmAssetRepository } from "./FmAssetRepository";

export type FmAssetAccessContext = {
  organisationId: string;
  profileId: string;
  session?: PlatformSession;
  access?: OperatingAccess;
};

export function resolveFmAssetOrganisation(session: PlatformSession) {
  return resolveFmWorkOrganisation(session);
}

/**
 * FM Assets (Supabase is the single source of truth). Capability gating
 * (ops.view / ops.create / ops.edit) is enforced by the route.
 */
export class FmAssetServerService {
  constructor(private readonly ctx: FmAssetAccessContext) {}

  private repo() {
    return new FmAssetRepository(this.ctx.organisationId);
  }
  private async hydrate(rows: FmAssetRow[]): Promise<Asset[]> {
    const relations = await this.repo().relations(rows);
    const migrated = await migratedHistoricalIds(createAdminClient(), this.ctx.organisationId, "fm_assets", rows.map((r) => r.id));
    return rows.map((row) => mapFmAssetRow(row, relations.get(row.id), originOf(migrated, row.id)));
  }

  async list(payload: unknown): Promise<PaginatedResult<Asset>> {
    const params = parseAssetListParams(payload);
    const { rows, total } = await this.repo().list(params);
    return paginateRows(await this.hydrate(rows), total, params.page, params.pageSize);
  }
  async getById(idOrCode: string): Promise<Asset> {
    const row = await this.repo().get(idOrCode);
    if (!row) throw new FmAssetNotFoundError(`Asset ${idOrCode} not found.`);
    return (await this.hydrate([row]))[0];
  }
  async create(payload: unknown): Promise<Asset> {
    const row = await this.repo().create(parseCreateAssetInput(payload), this.ctx.profileId);
    return (await this.hydrate([row]))[0];
  }
  async update(payload: unknown): Promise<Asset> {
    const row = await this.repo().update(parseUpdateAssetInput(payload), this.ctx.profileId);
    return (await this.hydrate([row]))[0];
  }
  async deactivate(payload: unknown): Promise<Asset> {
    const row = await this.repo().deactivate(parseAssetIdPayload(payload), this.ctx.profileId);
    return (await this.hydrate([row]))[0];
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(payload);
      case "getById":
        return this.getById(parseAssetIdPayload(payload));
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError("VALIDATION_ERROR", `Unknown assets action: ${action}`);
    }
  }
}
