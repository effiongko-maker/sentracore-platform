import "server-only";
import { FmAssetRepository } from "@/modules/assets/server/FmAssetRepository";
import { uuidsOnly } from "@/modules/assets/server/fmAssetDomain";
import { createAdminClient } from "@/utils/supabase/admin";
import type { IncidentListParams } from "@/modules/incidents/types";
import {
  EMPTY_INCIDENT_RELATIONS,
  FM_INCIDENT_SELECT,
  FmIncidentNotFoundError,
  FmIncidentReadOnlyError,
  FmIncidentUnavailableError,
  FmIncidentValidationError,
  UUID_RE,
  generateNextIncidentCode,
  sanitizeSearchTerm,
  type FmIncidentRelations,
  type FmIncidentRow,
  type ParsedCreateIncident,
  type ParsedUpdateIncident,
} from "./fmIncidentDomain";

type AdminClient = ReturnType<typeof createAdminClient>;

const CODE_RETRY_LIMIT = 5;

/** Active (non-terminal) Incident statuses — aligned with workload derivation. */
export const ACTIVE_INCIDENT_STATUS_LIST = [
  "reported",
  "triaged",
  "investigating",
  "contained",
] as const;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmIncidentUnavailableError("Incident storage is unavailable.");
  }
}

function isUniqueViolation(
  error: { code?: string; message?: string } | null
): boolean {
  return (
    error?.code === "23505" ||
    /duplicate key|unique constraint/i.test(error?.message ?? "")
  );
}

function throwDb(
  error: { code?: string; message?: string } | null,
  fallback: string
): never {
  const message = error?.message?.trim() || fallback;
  if (isUniqueViolation(error)) {
    throw new FmIncidentValidationError(
      "An incident with this reference already exists in the organisation."
    );
  }
  if (/_asset_fk/.test(message)) throw new FmIncidentValidationError("The asset must exist in this organisation and belong to the same facility.");
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmIncidentValidationError(
      "Incident references an invalid facility, request, incident or profile for this organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmIncidentValidationError("Incident values failed validation.");
  }
  throw new FmIncidentUnavailableError("Incident storage is unavailable.");
}

function asRow(value: unknown): FmIncidentRow {
  const rec = value as Record<string, unknown>;
  const text = (key: string) => (rec[key] != null ? String(rec[key]) : null);
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    code: String(rec.code ?? ""),
    facility_id: String(rec.facility_id),
    title: String(rec.title ?? ""),
    description: text("description"),
    location_detail: text("location_detail"),
    incident_type: String(rec.incident_type ?? "other"),
    source: String(rec.source ?? "manual"),
    category_id: text("category_id"),
    severity: String(rec.severity ?? "medium"),
    status: String(rec.status ?? "reported"),
    reported_via: text("reported_via"),
    is_emergency: Boolean(rec.is_emergency),
    people_affected:
      rec.people_affected != null ? Number(rec.people_affected) : null,
    hold_reason: text("hold_reason"),
    requires_work_instruction: Boolean(rec.requires_work_instruction),
    source_request_id: text("source_request_id"),
    parent_incident_id: text("parent_incident_id"),
    asset_id: text("asset_id"),
    reported_by_profile_id: text("reported_by_profile_id"),
    assigned_to_profile_id: text("assigned_to_profile_id"),
    operational_event_id: text("operational_event_id"),
    reported_at: String(rec.reported_at ?? ""),
    record_origin: rec.record_origin != null ? String(rec.record_origin) : "operational",
    discovered_at: text("discovered_at"),
    acknowledged_at: text("acknowledged_at"),
    response_due_at: text("response_due_at"),
    contained_at: text("contained_at"),
    resolved_at: text("resolved_at"),
    closed_at: text("closed_at"),
    immediate_actions: text("immediate_actions"),
    root_cause: text("root_cause"),
    corrective_actions: text("corrective_actions"),
    preventive_actions: text("preventive_actions"),
    resolution_notes: text("resolution_notes"),
    created_by_profile_id: text("created_by_profile_id"),
    updated_by_profile_id: text("updated_by_profile_id"),
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

function toColumns(
  input: ParsedCreateIncident | ParsedUpdateIncident,
  resolved: {
    facilityId?: string;
    sourceRequestId?: string | null;
    parentIncidentId?: string | null;
    assetId?: string | null;
  }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) out[key] = value;
  };
  set("title", input.title);
  set("description", input.description);
  set("location_detail", input.locationDetail);
  set("incident_type", input.incidentType);
  set("source", input.source);
  set("category_id", input.categoryId);
  set("severity", input.severity);
  set("status", input.status);
  set("reported_via", input.reportedVia);
  set("is_emergency", input.isEmergency);
  set("people_affected", input.peopleAffected);
  set("hold_reason", input.holdReason);
  set("requires_work_instruction", input.requiresWorkInstruction);
  set("asset_id", resolved.assetId);
  set("reported_by_profile_id", input.reportedByProfileId);
  set("assigned_to_profile_id", input.assignedToProfileId);
  set("operational_event_id", input.operationalEventId);
  set("reported_at", input.reportedAt);
  set("discovered_at", input.discoveredAt);
  set("acknowledged_at", input.acknowledgedAt);
  set("response_due_at", input.responseDueAt);
  set("contained_at", input.containedAt);
  set("resolved_at", input.resolvedAt);
  set("closed_at", input.closedAt);
  set("immediate_actions", input.immediateActions);
  set("root_cause", input.rootCause);
  set("corrective_actions", input.correctiveActions);
  set("preventive_actions", input.preventiveActions);
  set("resolution_notes", input.resolutionNotes);
  set("facility_id", resolved.facilityId);
  set("source_request_id", resolved.sourceRequestId);
  set("parent_incident_id", resolved.parentIncidentId);
  return out;
}

export class FmIncidentRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db()
  ) {}

  async resolveFacilityId(facilityIdOrCode: string): Promise<string> {
    const target = facilityIdOrCode.trim();
    if (!target) throw new FmIncidentValidationError("Facility is required.");
    const query = this.admin
      .from("fm_facilities")
      .select("id")
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.ilike("code", target).maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    if (!data) {
      throw new FmIncidentValidationError("Facility not found in this organisation.");
    }
    return String((data as { id: string }).id);
  }

  /** Request reference (REQ code or UUID) → fm_requests.id within this organisation. */
  async resolveRequestId(requestIdOrCode: string): Promise<string> {
    const target = requestIdOrCode.trim();
    const query = this.admin
      .from("fm_requests")
      .select("id")
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to resolve source request.");
    if (!data) {
      throw new FmIncidentValidationError(
        `Request ${target} not found in this organisation.`
      );
    }
    return String((data as { id: string }).id);
  }

  async resolveIncidentId(incidentIdOrCode: string): Promise<string> {
    const row = await this.getByIdOrCode(incidentIdOrCode);
    if (!row) {
      throw new FmIncidentValidationError(
        `Incident ${incidentIdOrCode} not found in this organisation.`
      );
    }
    return row.id;
  }

  async getByIdOrCode(idOrCode: string): Promise<FmIncidentRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const query = this.admin
      .from("fm_incidents")
      .select(FM_INCIDENT_SELECT)
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to load incident.");
    return data ? asRow(data) : null;
  }

  async listPage(
    params: IncidentListParams
  ): Promise<{ rows: FmIncidentRow[]; total: number }> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 8;

    let query = this.admin
      .from("fm_incidents")
      .select(FM_INCIDENT_SELECT, { count: "exact" })
      .eq("organisation_id", this.organisationId);

    if (params.status && params.status !== "all") query = query.eq("status", params.status);
    if (params.severity && params.severity !== "all") {
      query = query.eq("severity", params.severity);
    }
    if (params.requiresWorkOrder !== undefined && params.requiresWorkOrder !== "all") {
      query = query.eq("requires_work_instruction", params.requiresWorkOrder);
    }
    if (params.assignedToUserId && params.assignedToUserId !== "all") {
      // A non-UUID (legacy USR-*) assignee can match nothing: a valid empty result.
      if (!UUID_RE.test(params.assignedToUserId)) return { rows: [], total: 0 };
      query = query.eq("assigned_to_profile_id", params.assignedToUserId);
    }
    if (params.facilityId && params.facilityId !== "all") {
      const facilityId = UUID_RE.test(params.facilityId)
        ? params.facilityId
        : await this.resolveFacilityIdOrNull(params.facilityId);
      if (!facilityId) return { rows: [], total: 0 };
      query = query.eq("facility_id", facilityId);
    }

    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or(
        [`title.ilike.${like}`, `code.ilike.${like}`, `description.ilike.${like}`].join(",")
      );
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("code", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throwDb(error, "Unable to load incidents.");
    return { rows: (data ?? []).map(asRow), total: count ?? 0 };
  }

  private async resolveFacilityIdOrNull(value: string): Promise<string | null> {
    try {
      return await this.resolveFacilityId(value);
    } catch (error) {
      if (error instanceof FmIncidentValidationError) return null;
      throw error;
    }
  }

  /** Derive Work / Request / parent relations for a set of Incidents. */
  async relationsFor(rows: FmIncidentRow[]): Promise<Map<string, FmIncidentRelations>> {
    const result = new Map<string, FmIncidentRelations>();
    if (rows.length === 0) return result;
    for (const row of rows) result.set(row.id, { maintenanceIds: [] });

    const ids = rows.map((row) => row.id);
    const requestIds = [
      ...new Set(rows.map((row) => row.source_request_id).filter((id): id is string => !!id)),
    ];
    const parentIds = [
      ...new Set(rows.map((row) => row.parent_incident_id).filter((id): id is string => !!id)),
    ];

    const [work, requests, parents] = await Promise.all([
      this.admin
        .from("fm_work")
        .select("id, code, incident_id")
        .eq("organisation_id", this.organisationId)
        .in("incident_id", ids)
        .order("code", { ascending: true }),
      requestIds.length
        ? this.admin
            .from("fm_requests")
            .select("id, code")
            .eq("organisation_id", this.organisationId)
            .in("id", requestIds)
        : Promise.resolve({ data: [], error: null }),
      parentIds.length
        ? this.admin
            .from("fm_incidents")
            .select("id, code")
            .eq("organisation_id", this.organisationId)
            .in("id", parentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (work.error) throwDb(work.error, "Unable to load incident Work links.");
    if (requests.error) throwDb(requests.error, "Unable to load source requests.");
    if (parents.error) throwDb(parents.error, "Unable to load parent incidents.");

    const workIncident = new Map<string, string>();
    for (const entry of work.data ?? []) {
      const rec = entry as { id: string; code: string; incident_id: string };
      result.get(rec.incident_id)?.maintenanceIds.push(String(rec.code));
      workIncident.set(rec.id, rec.incident_id);
    }
    // Incident → Work → Work Instruction (derived; no Incident-side reference).
    if (workIncident.size > 0) {
      const instructions = await this.admin
        .from("fm_work_instructions")
        .select("code, work_id")
        .eq("organisation_id", this.organisationId)
        .in("work_id", [...workIncident.keys()])
        .order("code", { ascending: true });
      if (instructions.error) throwDb(instructions.error, "Unable to load incident Work Instructions.");
      for (const entry of instructions.data ?? []) {
        const rec = entry as { code: string; work_id: string };
        const relation = result.get(workIncident.get(rec.work_id)!);
        if (relation) relation.workOrderIds = [...(relation.workOrderIds ?? []), String(rec.code)];
      }
    }
    const requestCode = new Map(
      (requests.data ?? []).map((r) => [String((r as { id: string }).id), String((r as { code: string }).code)])
    );
    const parentCode = new Map(
      (parents.data ?? []).map((r) => [String((r as { id: string }).id), String((r as { code: string }).code)])
    );
    for (const row of rows) {
      const relation = result.get(row.id)!;
      if (row.source_request_id) relation.sourceRequestCode = requestCode.get(row.source_request_id);
      if (row.parent_incident_id) relation.parentIncidentCode = parentCode.get(row.parent_incident_id);
    }
    return result;
  }

  async relationsForOne(row: FmIncidentRow): Promise<FmIncidentRelations> {
    return (await this.relationsFor([row])).get(row.id) ?? { ...EMPTY_INCIDENT_RELATIONS };
  }

  private async latestCodeForYear(year: number): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_incidents")
      .select("code")
      .eq("organisation_id", this.organisationId)
      .ilike("code", `INC-${year}-%`)
      .order("code", { ascending: false })
      .limit(1);
    if (error) throwDb(error, "Unable to allocate incident reference.");
    return ((data ?? [])[0] as { code?: string } | undefined)?.code ?? null;
  }

  /** Resolve an Asset reference (UUID, or a code accepted as INPUT only) to its tenant UUID. */
  private async resolveAssetRef(ref: string | null | undefined): Promise<string | null | undefined> {
    if (ref === undefined) return undefined;
    if (ref === null || !ref.trim()) return null;
    const id = await new FmAssetRepository(this.organisationId, this.admin).findId(ref);
    if (!id) throw new FmIncidentValidationError(`Asset ${ref.trim()} not found in this organisation.`);
    return id;
  }

  private async resolveRelations(input: {
    facilityId?: string;
    sourceRequestRef?: string | null;
    parentIncidentRef?: string | null;
    assetRef?: string | null;
  }) {
    return {
      assetId: await this.resolveAssetRef(input.assetRef),
      facilityId: input.facilityId
        ? await this.resolveFacilityId(input.facilityId)
        : undefined,
      sourceRequestId:
        input.sourceRequestRef === undefined
          ? undefined
          : input.sourceRequestRef
            ? await this.resolveRequestId(input.sourceRequestRef)
            : null,
      parentIncidentId:
        input.parentIncidentRef === undefined
          ? undefined
          : input.parentIncidentRef
            ? await this.resolveIncidentId(input.parentIncidentRef)
            : null,
    };
  }

  /**
   * Create is guarded at the service/orchestration layer (Phase 18 freeze).
   * The unique (organisation, lower(code)) index arbitrates concurrent
   * allocation; a collision retries with the next reference.
   */
  async create(input: ParsedCreateIncident, actorProfileId: string): Promise<FmIncidentRow> {
    const resolved = await this.resolveRelations(input);
    const columns = toColumns(input, resolved);

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generateNextIncidentCode(
        await this.latestCodeForYear(new Date().getUTCFullYear())
      );
      const status = String(columns.status ?? "reported");
      const now = new Date().toISOString();
      const { data, error } = await this.admin
        .from("fm_incidents")
        .insert({
          ...columns,
          organisation_id: this.organisationId,
          code,
          resolved_at: columns.resolved_at ?? (status === "resolved" ? now : undefined),
          closed_at: columns.closed_at ?? (status === "closed" ? now : undefined),
          created_by_profile_id: actorProfileId,
          updated_by_profile_id: actorProfileId,
        })
        .select(FM_INCIDENT_SELECT)
        .single();
      if (error) {
        if (isUniqueViolation(error) && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "Unable to create incident.");
      }
      if (!data) throw new FmIncidentUnavailableError("Incident create returned no row.");
      return asRow(data);
    }
    throw new FmIncidentUnavailableError("Unable to allocate incident reference.");
  }

  async update(
    input: ParsedUpdateIncident,
    actorProfileId: string
  ): Promise<{ row: FmIncidentRow; previousStatus: string }> {
    const existing = await this.getByIdOrCode(input.id);
    if (!existing) throw new FmIncidentNotFoundError(`Incident ${input.id} not found.`);
    // Historical facts are never editable or cancellable: refuse BEFORE any relation resolution or write.
    if (existing.record_origin === "migrated_historical") throw new FmIncidentReadOnlyError();

    const resolved = await this.resolveRelations(input);
    if (resolved.parentIncidentId === existing.id) {
      throw new FmIncidentValidationError("An incident cannot be its own parent.");
    }
    const patch = toColumns(input, resolved);

    // Terminal transitions always carry their timestamp (DB check enforces it).
    const nextStatus = input.status ?? existing.status;
    const now = new Date().toISOString();
    if (nextStatus === "resolved" && !existing.resolved_at && patch.resolved_at == null) {
      patch.resolved_at = now;
    }
    if (nextStatus === "closed" && !existing.closed_at && patch.closed_at == null) {
      patch.closed_at = now;
    }
    patch.updated_by_profile_id = actorProfileId;

    const { data, error } = await this.admin
      .from("fm_incidents")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_INCIDENT_SELECT)
      .single();
    if (error) throwDb(error, "Unable to update incident.");
    if (!data) throw new FmIncidentNotFoundError(`Incident ${input.id} not found.`);
    return { row: asRow(data), previousStatus: existing.status };
  }

  /** Active Incidents assigned to a profile (Command Centre / Home). */
  async countActiveForProfile(profileId: string): Promise<number> {
    const { count, error } = await this.admin
      .from("fm_incidents")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", this.organisationId)
      .eq("assigned_to_profile_id", profileId)
      .in("status", [...ACTIVE_INCIDENT_STATUS_LIST]);
    if (error) throwDb(error, "Unable to load incident workload.");
    return count ?? 0;
  }

  /** Active Incident codes per Asset UUID — asset workload. */
  async activeByAssetIds(assetIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const refs = uuidsOnly(assetIds);
    if (refs.length === 0) return out;
    const { data, error } = await this.admin
      .from("fm_incidents")
      .select("code, asset_id")
      .eq("organisation_id", this.organisationId)
      .in("asset_id", refs)
      .in("status", [...ACTIVE_INCIDENT_STATUS_LIST])
      .order("code", { ascending: true });
    if (error) throwDb(error, "Unable to load asset incident workload.");
    for (const row of data ?? []) {
      const rec = row as { code: string; asset_id: string };
      const list = out.get(rec.asset_id) ?? [];
      list.push(String(rec.code));
      out.set(rec.asset_id, list);
    }
    return out;
  }
}
