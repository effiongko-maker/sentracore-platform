import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { PaginatedResult } from "@/types";
import type { MasterDataItem } from "@/modules/master-data/types";
import {
  FmVendorNotFoundError,
  mapFmVendorRow,
  paginateRows,
  parseCreateVendorInput,
  parseUpdateVendorInput,
  parseVendorIdPayload,
  parseVendorListParams,
} from "./fmVendorDomain";
import { FmVendorRepository } from "./FmVendorRepository";

export type FmVendorAccessContext = { organisationId: string; profileId: string };

/**
 * FM Vendors (Supabase is the single source of truth). Capability gating
 * (ops.view / ops.create / ops.edit) is enforced by the /api/master-data route.
 */
export class FmVendorServerService {
  constructor(private readonly ctx: FmVendorAccessContext) {}

  private repo() {
    return new FmVendorRepository(this.ctx.organisationId);
  }

  async list(payload: unknown): Promise<PaginatedResult<MasterDataItem>> {
    const params = parseVendorListParams(payload);
    const { rows, total } = await this.repo().list(params);
    return paginateRows(rows.map(mapFmVendorRow), total, params.page, params.pageSize);
  }
  async getById(payload: unknown): Promise<MasterDataItem> {
    const id = parseVendorIdPayload(payload);
    const row = await this.repo().get(id);
    if (!row) throw new FmVendorNotFoundError(`Vendor ${id} not found.`);
    return mapFmVendorRow(row);
  }
  async create(payload: unknown): Promise<MasterDataItem> {
    return mapFmVendorRow(await this.repo().create(parseCreateVendorInput(payload), this.ctx.profileId));
  }
  async update(payload: unknown): Promise<MasterDataItem> {
    return mapFmVendorRow(await this.repo().update(parseUpdateVendorInput(payload), this.ctx.profileId));
  }
  async deactivate(payload: unknown): Promise<MasterDataItem> {
    return mapFmVendorRow(await this.repo().deactivate(parseVendorIdPayload(payload), this.ctx.profileId));
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(payload);
      case "getById":
        return this.getById(payload);
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError("VALIDATION_ERROR", `Unknown vendors action: ${action}`);
    }
  }
}
