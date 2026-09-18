import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { FmFacilitiesRepository } from "@/modules/facilities/server/FmFacilitiesRepository";
import { UUID_RE } from "@/modules/facilities/server/fmFacilityDomain";
import type { CreateMasterDataInput, UpdateMasterDataInput } from "@/modules/master-data/types";
import {
  FmLocationNotFoundError,
  FmLocationUnavailableError,
  FmLocationValidationError,
  LOCATION_CODE_PREFIX,
  LOCATION_TABLE,
  generateNextLocationCode,
  type FmLocationRow,
  type LocationMasterDataEntity,
} from "./fmLocationDomain";

type AdminClient = ReturnType<typeof createAdminClient>;

const SELECT_BY_ENTITY: Record<LocationMasterDataEntity, string> = {
  buildings:
    "id, organisation_id, facility_id, name, code, status, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at",
  floors:
    "id, organisation_id, facility_id, building_id, name, code, status, description, level, created_by_profile_id, updated_by_profile_id, created_at, updated_at",
  rooms:
    "id, organisation_id, facility_id, building_id, floor_id, name, code, status, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at",
  departments:
    "id, organisation_id, facility_id, name, code, status, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at",
};

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmLocationUnavailableError("Location storage is unavailable.");
  }
}

function throwDb(
  entity: LocationMasterDataEntity,
  error: { code?: string; message?: string } | null,
  fallback: string
): never {
  const message = error?.message?.trim() || fallback;
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    throw new FmLocationValidationError(
      `A ${entity.slice(0, -1)} with this name or code already exists in that parent.`
    );
  }
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmLocationValidationError(
      "Parent location is invalid for this organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmLocationValidationError("Location values failed validation.");
  }
  if (
    /fetch failed|econn|timeout|temporarily unavailable|jwt|invalid api key/i.test(
      message
    )
  ) {
    throw new FmLocationUnavailableError("Location storage is unavailable.");
  }
  throw new FmLocationUnavailableError("Location storage is unavailable.");
}

function asRow(
  entity: LocationMasterDataEntity,
  value: unknown
): FmLocationRow {
  const rec = value as Record<string, unknown>;
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    facility_id: String(rec.facility_id),
    building_id:
      entity === "floors" || entity === "rooms"
        ? rec.building_id != null
          ? String(rec.building_id)
          : null
        : null,
    floor_id:
      entity === "rooms"
        ? rec.floor_id != null
          ? String(rec.floor_id)
          : null
        : null,
    name: String(rec.name ?? ""),
    code: rec.code != null ? String(rec.code) : null,
    status: String(rec.status ?? "active"),
    description: rec.description != null ? String(rec.description) : null,
    level:
      entity === "floors" && rec.level != null ? String(rec.level) : null,
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

type ParentRefs = {
  facilityId: string;
  buildingId?: string;
  floorId?: string;
};

export class FmLocationRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db(),
    private readonly facilities = new FmFacilitiesRepository(organisationId, admin)
  ) {}

  private table(entity: LocationMasterDataEntity) {
    return this.admin.from(LOCATION_TABLE[entity]);
  }

  async listRows(entity: LocationMasterDataEntity): Promise<FmLocationRow[]> {
    const { data, error } = await this.table(entity)
      .select(SELECT_BY_ENTITY[entity])
      .eq("organisation_id", this.organisationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) throwDb(entity, error, `Unable to load ${entity}.`);
    return (data ?? []).map((row) => asRow(entity, row));
  }

  async getByIdOrCode(
    entity: LocationMasterDataEntity,
    idOrCode: string
  ): Promise<FmLocationRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;

    if (UUID_RE.test(target)) {
      const { data, error } = await this.table(entity)
        .select(SELECT_BY_ENTITY[entity])
        .eq("organisation_id", this.organisationId)
        .eq("id", target)
        .maybeSingle();
      if (error) throwDb(entity, error, `Unable to load ${entity.slice(0, -1)}.`);
      return data ? asRow(entity, data) : null;
    }

    const { data, error } = await this.table(entity)
      .select(SELECT_BY_ENTITY[entity])
      .eq("organisation_id", this.organisationId)
      .ilike("code", target)
      .maybeSingle();
    if (error) throwDb(entity, error, `Unable to load ${entity.slice(0, -1)}.`);
    return data ? asRow(entity, data) : null;
  }

  private async nextCode(
    entity: LocationMasterDataEntity,
    parent: ParentRefs,
    requested?: string
  ): Promise<string> {
    const explicit = requested?.trim();
    if (explicit) return explicit;

    let query = this.table(entity)
      .select("code")
      .eq("organisation_id", this.organisationId);

    if (entity === "buildings" || entity === "departments") {
      query = query.eq("facility_id", parent.facilityId);
    } else if (entity === "floors") {
      query = query.eq("building_id", parent.buildingId);
    } else {
      query = query.eq("floor_id", parent.floorId);
    }

    const { data, error } = await query;
    if (error) throwDb(entity, error, `Unable to allocate ${entity.slice(0, -1)} code.`);
    const codes = (data ?? []).map((row) =>
      String((row as { code?: string }).code ?? "")
    );
    return generateNextLocationCode(LOCATION_CODE_PREFIX[entity], codes);
  }

  private async resolveFacilityId(idOrCode: string): Promise<string> {
    const row = await this.facilities.getByIdOrCode(idOrCode);
    if (!row) {
      throw new FmLocationValidationError("Facility is invalid for this organisation.");
    }
    return row.id;
  }

  private async resolveBuilding(idOrCode: string): Promise<FmLocationRow> {
    const row = await this.getByIdOrCode("buildings", idOrCode);
    if (!row) {
      throw new FmLocationValidationError("Building is invalid for this organisation.");
    }
    return row;
  }

  private async resolveFloor(idOrCode: string): Promise<FmLocationRow> {
    const row = await this.getByIdOrCode("floors", idOrCode);
    if (!row) {
      throw new FmLocationValidationError("Floor is invalid for this organisation.");
    }
    return row;
  }

  private async resolveParents(
    entity: LocationMasterDataEntity,
    input: {
      facilityId?: string;
      buildingId?: string;
      floorId?: string;
    }
  ): Promise<ParentRefs> {
    if (entity === "departments" || entity === "buildings") {
      if (!input.facilityId) {
        throw new FmLocationValidationError("Facility is required.");
      }
      return { facilityId: await this.resolveFacilityId(input.facilityId) };
    }

    if (entity === "floors") {
      if (!input.buildingId) {
        throw new FmLocationValidationError("Building is required.");
      }
      const building = await this.resolveBuilding(input.buildingId);
      if (input.facilityId) {
        const facilityId = await this.resolveFacilityId(input.facilityId);
        if (facilityId !== building.facility_id) {
          throw new FmLocationValidationError(
            "Floor facility must match the selected building."
          );
        }
      }
      return {
        facilityId: building.facility_id,
        buildingId: building.id,
      };
    }

    if (!input.floorId) {
      throw new FmLocationValidationError("Floor is required.");
    }
    const floor = await this.resolveFloor(input.floorId);
    if (input.buildingId) {
      const building = await this.resolveBuilding(input.buildingId);
      if (building.id !== floor.building_id) {
        throw new FmLocationValidationError(
          "Room building must match the selected floor."
        );
      }
    }
    if (input.facilityId) {
      const facilityId = await this.resolveFacilityId(input.facilityId);
      if (facilityId !== floor.facility_id) {
        throw new FmLocationValidationError(
          "Room facility must match the selected floor."
        );
      }
    }
    return {
      facilityId: floor.facility_id,
      buildingId: floor.building_id ?? undefined,
      floorId: floor.id,
    };
  }

  async create(
    input: CreateMasterDataInput,
    actorProfileId: string | null
  ): Promise<FmLocationRow> {
    const entity = input.entity as LocationMasterDataEntity;
    const parent = await this.resolveParents(entity, input);
    const code = await this.nextCode(entity, parent, input.code);

    const insert: Record<string, unknown> = {
      organisation_id: this.organisationId,
      facility_id: parent.facilityId,
      name: input.name.trim(),
      code,
      status: input.status ?? "active",
      description: input.description?.trim() || null,
      created_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
    };
    if (entity === "floors" || entity === "rooms") {
      insert.building_id = parent.buildingId;
    }
    if (entity === "rooms") {
      insert.floor_id = parent.floorId;
    }
    if (entity === "floors") {
      insert.level = input.level?.trim() || null;
    }

    const { data, error } = await this.table(entity)
      .insert(insert)
      .select(SELECT_BY_ENTITY[entity])
      .single();

    if (error) throwDb(entity, error, `Unable to create ${entity.slice(0, -1)}.`);
    if (!data) {
      throw new FmLocationUnavailableError(
        `Unable to create ${entity.slice(0, -1)}.`
      );
    }
    return asRow(entity, data);
  }

  async update(
    entity: LocationMasterDataEntity,
    id: string,
    input: UpdateMasterDataInput,
    actorProfileId: string | null
  ): Promise<FmLocationRow> {
    const existing = await this.getByIdOrCode(entity, id);
    if (!existing) {
      throw new FmLocationNotFoundError(`${entity} ${id} not found.`);
    }

    const nextFacilityId = input.facilityId ?? existing.facility_id;
    const nextBuildingId = input.buildingId ?? existing.building_id ?? undefined;
    const nextFloorId = input.floorId ?? existing.floor_id ?? undefined;
    const parent = await this.resolveParents(entity, {
      facilityId: nextFacilityId,
      buildingId: nextBuildingId,
      floorId: nextFloorId,
    });

    const patch: Record<string, unknown> = {
      updated_by_profile_id: actorProfileId,
      facility_id: parent.facilityId,
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.status !== undefined) patch.status = input.status;
    if (input.description !== undefined) {
      patch.description = input.description.trim() || null;
    }
    if (entity === "floors" || entity === "rooms") {
      patch.building_id = parent.buildingId;
    }
    if (entity === "rooms") {
      patch.floor_id = parent.floorId;
    }
    if (entity === "floors" && input.level !== undefined) {
      patch.level = input.level.trim() || null;
    }

    const { data, error } = await this.table(entity)
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(SELECT_BY_ENTITY[entity])
      .single();

    if (error) throwDb(entity, error, `Unable to update ${entity.slice(0, -1)}.`);
    if (!data) {
      throw new FmLocationNotFoundError(`${entity} ${id} not found.`);
    }
    return asRow(entity, data);
  }

  async deactivate(
    entity: LocationMasterDataEntity,
    id: string,
    actorProfileId: string | null
  ): Promise<FmLocationRow> {
    return this.update(entity, id, { entity, id, status: "inactive" }, actorProfileId);
  }
}
