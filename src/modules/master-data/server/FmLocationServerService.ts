import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { PaginatedResult } from "@/types";
import type {
  LocationCatalog,
  LocationCatalogItem,
  MasterDataItem,
  MasterDataListParams,
} from "@/modules/master-data/types";
import {
  FmFacilitiesRepository,
} from "@/modules/facilities/server/FmFacilitiesRepository";
import type { FmFacilitiesAccessContext } from "@/modules/facilities/server/FmFacilitiesServerService";
import { mapFmFacilityRowToApi } from "@/modules/facilities/server/fmFacilityDomain";
import {
  FmLocationNotFoundError,
  filterLocationItems,
  isCatalogVisibleStatus,
  mapFmLocationRowToApi,
  mapFmLocationRowToCatalogItem,
  paginateLocationRows,
  parseCreateLocationInput,
  parseLocationEntity,
  parseLocationIdPayload,
  parseLocationListParams,
  parseUpdateLocationInput,
  type LocationMasterDataEntity,
} from "./fmLocationDomain";
import { FmLocationRepository } from "./FmLocationRepository";

export class FmLocationServerService {
  constructor(private readonly ctx: FmFacilitiesAccessContext) {}

  private repo() {
    return new FmLocationRepository(this.ctx.organisationId);
  }

  private facilities() {
    return new FmFacilitiesRepository(this.ctx.organisationId);
  }

  async list(params: MasterDataListParams): Promise<PaginatedResult<MasterDataItem>> {
    const parsed = parseLocationListParams(params);
    const entity = parsed.entity as LocationMasterDataEntity;
    const rows = await this.repo().listRows(entity);
    const mapped = rows.map((row) => mapFmLocationRowToApi(entity, row));
    const filtered = filterLocationItems(mapped, parsed);
    return paginateLocationRows(
      filtered,
      parsed.page ?? 1,
      parsed.pageSize ?? 10
    );
  }

  async getById(payload: unknown): Promise<MasterDataItem> {
    const { entity, id } = parseLocationIdPayload(payload);
    const row = await this.repo().getByIdOrCode(entity, id);
    if (!row) {
      throw new FmLocationNotFoundError(`${entity} ${id} not found.`);
    }
    return mapFmLocationRowToApi(entity, row);
  }

  async create(payload: unknown): Promise<MasterDataItem> {
    const input = parseCreateLocationInput(payload);
    const entity = input.entity as LocationMasterDataEntity;
    const row = await this.repo().create(input, this.ctx.profileId);
    return mapFmLocationRowToApi(entity, row);
  }

  async update(payload: unknown): Promise<MasterDataItem> {
    const input = parseUpdateLocationInput(payload);
    const entity = input.entity as LocationMasterDataEntity;
    const row = await this.repo().update(
      entity,
      input.id,
      input,
      this.ctx.profileId
    );
    return mapFmLocationRowToApi(entity, row);
  }

  async deactivate(payload: unknown): Promise<MasterDataItem> {
    const { entity, id } = parseLocationIdPayload(payload);
    const row = await this.repo().deactivate(entity, id, this.ctx.profileId);
    return mapFmLocationRowToApi(entity, row);
  }

  /**
   * Facilities + buildings + floors + rooms from Supabase.
   * A failed source fails the whole catalog — never a healthy empty catalog.
   */
  async getLocationCatalog(): Promise<LocationCatalog> {
    const [facilityRows, buildingRows, floorRows, roomRows] = await Promise.all([
      this.facilities().listRows(),
      this.repo().listRows("buildings"),
      this.repo().listRows("floors"),
      this.repo().listRows("rooms"),
    ]);

    const facilities: LocationCatalogItem[] = facilityRows
      .filter((row) => isCatalogVisibleStatus(row.status))
      .map((row) => {
        const mapped = mapFmFacilityRowToApi(row);
        return { id: mapped.id, name: mapped.name };
      })
      .filter((item) => item.id && item.name);

    const buildings = buildingRows
      .filter((row) => isCatalogVisibleStatus(row.status))
      .map((row) => mapFmLocationRowToCatalogItem("buildings", row))
      .filter((item) => item.id && item.name);

    const floors = floorRows
      .filter((row) => isCatalogVisibleStatus(row.status))
      .map((row) => mapFmLocationRowToCatalogItem("floors", row))
      .filter((item) => item.id && item.name);

    const rooms = roomRows
      .filter((row) => isCatalogVisibleStatus(row.status))
      .map((row) => mapFmLocationRowToCatalogItem("rooms", row))
      .filter((item) => item.id && item.name);

    return { facilities, buildings, floors, rooms };
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(parseLocationListParams(payload));
      case "getById":
        return this.getById(payload);
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      case "getLocationCatalog":
        return this.getLocationCatalog();
      default:
        throw new ActionError(
          "VALIDATION_ERROR",
          `Unknown master-data action: ${action}`
        );
    }
  }

  static peekEntity(payload: unknown): string | undefined {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return undefined;
    }
    const entity = (payload as Record<string, unknown>).entity;
    return entity != null ? String(entity).trim().toLowerCase() : undefined;
  }

  static isLocationEntity(entity: string | undefined): boolean {
    if (!entity) return false;
    try {
      parseLocationEntity({ entity });
      return true;
    } catch {
      return false;
    }
  }
}
