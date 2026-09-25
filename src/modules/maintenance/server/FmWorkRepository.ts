import "server-only";
import {
  FM_HISTORICAL_2025_SHEETS,
  loadProvenanceTargetIds,
  type ProvenanceClient,
} from "@/lib/fm/sourceRegisterScope";
import { jobOrderExecutionBlock, workReopenBlock } from "@/modules/maintenance/commercialRoute";
import { FmAssetRepository } from "@/modules/assets/server/FmAssetRepository";
import { uuidsOnly } from "@/modules/assets/server/fmAssetDomain";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  scopeAllowsFacilities,
  UNRESTRICTED_REPO_SCOPE,
  type FmRepoScope,
} from "@/lib/access/facilityScope";
import {
  FM_WORK_SELECT,
  FmWorkNotFoundError,
  FmWorkReadOnlyError,
  assertCommercialRouteChangeAllowed,
  FmWorkUnavailableError,
  FmWorkValidationError,
  UUID_RE,
  generateNextWorkCode,
  type FmWorkRow,
  type ParsedCreateWork,
  type ParsedUpdateWork,
} from "./fmWorkDomain";

type AdminClient = ReturnType<typeof createAdminClient>;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmWorkUnavailableError("Work storage is unavailable.");
  }
}

function throwDb(
  error: { code?: string; message?: string } | null,
  fallback: string
): never {
  const message = error?.message?.trim() || fallback;
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    throw new FmWorkValidationError(
      "A work item with this code already exists in the organisation."
    );
  }
  if (/_asset_fk/.test(message)) throw new FmWorkValidationError("The asset must exist in this organisation and belong to the same facility.");
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmWorkValidationError(
      "Work references an invalid facility or profile for this organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmWorkValidationError("Work values failed validation.");
  }
  if (
    /fetch failed|econn|timeout|temporarily unavailable|jwt|invalid api key/i.test(
      message
    )
  ) {
    throw new FmWorkUnavailableError("Work storage is unavailable.");
  }
  throw new FmWorkUnavailableError("Work storage is unavailable.");
}

function asRow(value: unknown): FmWorkRow {
  const rec = value as Record<string, unknown>;
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    code: String(rec.code ?? ""),
    facility_id: String(rec.facility_id),
    title: String(rec.title ?? ""),
    description: rec.description != null ? String(rec.description) : null,
    work_kind: rec.work_kind != null ? String(rec.work_kind) : null,
    source: String(rec.source ?? "manual"),
    priority: String(rec.priority ?? "medium"),
    status: String(rec.status ?? "requested"),
    asset_id: rec.asset_id != null ? String(rec.asset_id) : null,
    source_request_id:
      rec.source_request_id != null ? String(rec.source_request_id) : null,
    source_request_code: null,
    incident_id: rec.incident_id != null ? String(rec.incident_id) : null,
    incident_code: null,
    work_instruction_codes: [],
    job_order_codes: [],
    client_approval_code: null,
    client_approval_status: null,
    assigned_to_profile_id:
      rec.assigned_to_profile_id != null
        ? String(rec.assigned_to_profile_id)
        : null,
    reported_by_profile_id:
      rec.reported_by_profile_id != null
        ? String(rec.reported_by_profile_id)
        : null,
    hold_reason: rec.hold_reason != null ? String(rec.hold_reason) : null,
    requires_work_instruction: Boolean(rec.requires_work_instruction),
    commercial_route: rec.commercial_route != null ? String(rec.commercial_route) : null,
    operational_event_id:
      rec.operational_event_id != null
        ? String(rec.operational_event_id)
        : null,
    // NULL = unknown reporting date (migrated historical Work only) — never coerced to "".
    reported_at: rec.reported_at != null ? String(rec.reported_at) : null,
    record_origin: rec.record_origin != null ? String(rec.record_origin) : "operational",
    due_at: rec.due_at != null ? String(rec.due_at) : null,
    scheduled_start_at:
      rec.scheduled_start_at != null ? String(rec.scheduled_start_at) : null,
    scheduled_end_at:
      rec.scheduled_end_at != null ? String(rec.scheduled_end_at) : null,
    started_at: rec.started_at != null ? String(rec.started_at) : null,
    completed_at: rec.completed_at != null ? String(rec.completed_at) : null,
    completion_notes:
      rec.completion_notes != null ? String(rec.completion_notes) : null,
    category_id: rec.category_id != null ? String(rec.category_id) : null,
    department: rec.department != null ? String(rec.department) : null,
    created_by_profile_id:
      rec.created_by_profile_id != null
        ? String(rec.created_by_profile_id)
        : null,
    updated_by_profile_id:
      rec.updated_by_profile_id != null
        ? String(rec.updated_by_profile_id)
        : null,
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

export class FmWorkRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db(),
    private readonly scope: FmRepoScope = UNRESTRICTED_REPO_SCOPE
  ) {}

  /**
   * Additional facilities of multi-facility Work (fm_work_facilities), keyed by Work UUID. The primary
   * fm_work.facility_id stays the record's own facility; a Work item is in scope when ANY of its facilities is.
   */
  private async extraFacilities(workIds?: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    let query = this.admin.from("fm_work_facilities").select("work_id, facility_id").eq("organisation_id", this.organisationId);
    if (workIds) {
      if (workIds.length === 0) return out;
      query = query.in("work_id", workIds);
    }
    const { data, error } = await query;
    if (error) throwDb(error, "Unable to load Work facilities.");
    for (const row of data ?? []) {
      const rec = row as { work_id: string; facility_id: string };
      out.set(rec.work_id, [...(out.get(rec.work_id) ?? []), rec.facility_id]);
    }
    return out;
  }

  private async withinScope(rows: FmWorkRow[]): Promise<FmWorkRow[]> {
    if (this.scope.read.unrestricted || rows.length === 0) return rows;
    const extra = await this.extraFacilities(rows.length > 200 ? undefined : rows.map((r) => r.id));
    return rows.filter((r) => scopeAllowsFacilities(this.scope.read, [r.facility_id, ...(extra.get(r.id) ?? [])]));
  }

  /** Work imported from the 2025 registers (governed provenance only) — history, not the current operating picture. */
  async historical2025Ids(): Promise<string[]> {
    try {
      return await loadProvenanceTargetIds(this.admin as unknown as ProvenanceClient, {
        organisationId: this.organisationId,
        target: "fm_work",
        sheets: FM_HISTORICAL_2025_SHEETS,
      });
    } catch (error) {
      throwDb({ message: error instanceof Error ? error.message : undefined }, "Unable to load Work provenance.");
    }
  }

  async listRows(): Promise<FmWorkRow[]> {
    const rows: FmWorkRow[] = [];
    const batchSize = 500;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.admin
        .from("fm_work")
        .select(FM_WORK_SELECT)
        .eq("organisation_id", this.organisationId)
        .order("reported_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throwDb(error, "Unable to load work.");
      const batch = (data ?? []).map(asRow);
      rows.push(...batch);
      if (batch.length < batchSize) return this.withRequestCodes(await this.withinScope(rows));
    }
  }

  async listCodes(): Promise<string[]> {
    const codes: string[] = [];
    const batchSize = 500;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.admin
        .from("fm_work")
        .select("code")
        .eq("organisation_id", this.organisationId)
        .order("code", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throwDb(error, "Unable to load work codes.");
      const batch = (data ?? []).map((row) => String((row as { code: string }).code));
      codes.push(...batch);
      if (batch.length < batchSize) return codes;
    }
  }

  async getByIdOrCode(idOrCode: string): Promise<FmWorkRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;

    if (UUID_RE.test(target)) {
      const { data, error } = await this.admin
        .from("fm_work")
        .select(FM_WORK_SELECT)
        .eq("organisation_id", this.organisationId)
        .eq("id", target)
        .maybeSingle();
      if (error) throwDb(error, "Unable to load work.");
      if (data) {
        // Direct reads obey the same facility scope as lists: out of scope is "not found".
        const scoped = await this.withinScope([asRow(data)]);
        return scoped.length ? (await this.withRequestCodes(scoped))[0]! : null;
      }
    }

    const { data, error } = await this.admin
      .from("fm_work")
      .select(FM_WORK_SELECT)
      .eq("organisation_id", this.organisationId)
      .ilike("code", target)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load work.");
    if (!data) return null;
    const scoped = await this.withinScope([asRow(data)]);
    return scoped.length ? (await this.withRequestCodes(scoped))[0]! : null;
  }


  /** Additional facilities a Work covers ("Both"): resolved in tenant, each one the actor may operate in. */
  private async resolveAdditionalFacilities(primaryId: string, refs: string[] | undefined): Promise<string[]> {
    const out: string[] = [];
    for (const ref of refs ?? []) {
      const id = await this.resolveFacilityId(ref);
      if (!this.scope.canOperateIn(id)) {
        throw new FmWorkValidationError("You are not authorised to use Work in every selected facility.");
      }
      if (id !== primaryId && !out.includes(id)) out.push(id);
    }
    return out;
  }

  /**
   * fm_work_facilities is the record of EVERY facility a multi-facility Work covers, including facility_id (existing
   * pattern). A single-facility Work has no rows. Never splits cost or commercial value.
   */
  private async replaceCoveredFacilities(workId: string, primaryId: string, additional: string[]): Promise<void> {
    const del = await this.admin.from("fm_work_facilities").delete().eq("organisation_id", this.organisationId).eq("work_id", workId);
    if (del.error) throwDb(del.error, "Unable to update Work facilities.");
    if (additional.length === 0) return;
    const ins = await this.admin.from("fm_work_facilities").insert(
      [primaryId, ...additional].map((facility_id) => ({ organisation_id: this.organisationId, work_id: workId, facility_id }))
    );
    if (ins.error) throwDb(ins.error, "Unable to record Work facilities.");
  }

  /** Attach display codes of each row's source Request and treated Incident. */
  private async withRequestCodes(rows: FmWorkRow[]): Promise<FmWorkRow[]> {
    const requestIds = [
      ...new Set(
        rows.map((row) => row.source_request_id).filter((id): id is string => !!id)
      ),
    ];
    const incidentIds = [
      ...new Set(
        rows.map((row) => row.incident_id).filter((id): id is string => !!id)
      ),
    ];
    if (rows.length === 0) return rows;

    // Work Instructions and the Work-level client Approval that belong to these Works (derived — never stored on Work).
    const workIds = rows.map((row) => row.id);
    const [instructions, approvals] = await Promise.all([
      this.admin
        .from("fm_work_instructions")
        .select("code, work_id, order_type")
        .eq("organisation_id", this.organisationId)
        .in("work_id", workIds)
        .order("code", { ascending: true }),
      this.admin
        .from("fm_approvals")
        .select("code, status, work_id")
        .eq("organisation_id", this.organisationId)
        .in("work_id", workIds),
    ]);
    if (instructions.error) throwDb(instructions.error, "Unable to load Work Instructions.");
    if (approvals.error) throwDb(approvals.error, "Unable to load Work approvals.");
    const instructionCodes = new Map<string, string[]>();
    const jobOrderCodes = new Map<string, string[]>();
    for (const entry of instructions.data ?? []) {
      const rec = entry as { code: string; work_id: string; order_type: string };
      instructionCodes.set(rec.work_id, [...(instructionCodes.get(rec.work_id) ?? []), String(rec.code)]);
      if (rec.order_type === "job_order") {
        jobOrderCodes.set(rec.work_id, [...(jobOrderCodes.get(rec.work_id) ?? []), String(rec.code)]);
      }
    }
    const approvalByWork = new Map(
      (approvals.data ?? []).map((entry) => {
        const rec = entry as { code: string; status: string; work_id: string };
        return [rec.work_id, rec] as const;
      })
    );

    const lookup = async (table: "fm_requests" | "fm_incidents", ids: string[]) => {
      const codes = new Map<string, string>();
      if (ids.length === 0) return codes;
      const { data, error } = await this.admin
        .from(table)
        .select("id, code")
        .eq("organisation_id", this.organisationId)
        .in("id", ids);
      if (error) throwDb(error, "Unable to load Work provenance.");
      for (const row of data ?? []) {
        codes.set(String((row as { id: string }).id), String((row as { code: string }).code));
      }
      return codes;
    };
    const [requestCodes, incidentCodes, covered] = await Promise.all([
      lookup("fm_requests", requestIds),
      lookup("fm_incidents", incidentIds),
      this.extraFacilities(workIds.length > 200 ? undefined : workIds),
    ]);
    return rows.map((row) => ({
      ...row,
      // Every facility the Work covers (fm_work_facilities, primary first); empty = its single facility_id.
      covered_facility_ids: covered.get(row.id)
        ? [row.facility_id, ...covered.get(row.id)!.filter((id) => id !== row.facility_id)]
        : [],
      source_request_code: row.source_request_id
        ? (requestCodes.get(row.source_request_id) ?? null)
        : null,
      incident_code: row.incident_id
        ? (incidentCodes.get(row.incident_id) ?? null)
        : null,
      work_instruction_codes: instructionCodes.get(row.id) ?? [],
      job_order_codes: jobOrderCodes.get(row.id) ?? [],
      client_approval_code: approvalByWork.get(row.id)?.code ?? null,
      client_approval_status: approvalByWork.get(row.id)?.status ?? null,
    }));
  }

  /**
   * Resolve a Request reference (REQ code or UUID) inside this organisation.
   * Work may only cite a Request that exists in Supabase.
   */
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
      throw new FmWorkValidationError(
        `Request ${target} not found in this organisation.`
      );
    }
    return String((data as { id: string }).id);
  }

  /** Resolve an Incident reference (INC code or UUID) inside this organisation. */
  async resolveIncidentId(incidentIdOrCode: string): Promise<string> {
    const target = incidentIdOrCode.trim();
    const query = this.admin
      .from("fm_incidents")
      .select("id")
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to resolve source incident.");
    if (!data) {
      throw new FmWorkValidationError(
        `Incident ${target} not found in this organisation.`
      );
    }
    return String((data as { id: string }).id);
  }

  async resolveFacilityId(facilityIdOrCode: string): Promise<string> {
    const target = facilityIdOrCode.trim();
    if (!target) {
      throw new FmWorkValidationError("Facility is required.");
    }

    if (UUID_RE.test(target)) {
      const { data, error } = await this.admin
        .from("fm_facilities")
        .select("id")
        .eq("organisation_id", this.organisationId)
        .eq("id", target)
        .maybeSingle();
      if (error) throwDb(error, "Unable to resolve facility.");
      if (!data) {
        throw new FmWorkValidationError(
          "Facility not found in this organisation."
        );
      }
      return String((data as { id: string }).id);
    }

    const { data, error } = await this.admin
      .from("fm_facilities")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .ilike("code", target)
      .maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    if (!data) {
      throw new FmWorkValidationError(
        "Facility not found in this organisation."
      );
    }
    return String((data as { id: string }).id);
  }

  /** The assignee must hold an active assignment at the Work's facility (any of them, for a multi-facility Work). */
  async assertAssigneeAtFacility(
    profileId: string,
    facilityId: string | string[]
  ): Promise<void> {
    const facilities = Array.isArray(facilityId) ? facilityId : [facilityId];
    const { data, error } = await this.admin
      .from("fm_facility_assignments")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .in("facility_id", facilities)
      .eq("status", "active")
      .limit(1);
    if (error) throwDb(error, "Unable to validate assignee.");
    if (!data || data.length === 0) {
      throw new FmWorkValidationError(
        "Assignee must have an active facility assignment at this facility."
      );
    }
  }

  async countActiveForProfile(profileId: string): Promise<number> {
    const { data, error } = await this.admin
      .from("fm_work")
      .select("id, status")
      .eq("organisation_id", this.organisationId)
      .eq("assigned_to_profile_id", profileId);
    if (error) throwDb(error, "Unable to load work workload.");
    const active = new Set([
      "requested",
      "triaged",
      "scheduled",
      "in_progress",
      "on_hold",
    ]);
    return (data ?? []).filter((row) =>
      active.has(String((row as { status: string }).status))
    ).length;
  }

  async create(
    input: ParsedCreateWork,
    actorProfileId: string
  ): Promise<FmWorkRow> {
    const facilityId = await this.resolveFacilityId(input.facilityId);
    if (!this.scope.canOperateIn(facilityId)) {
      throw new FmWorkValidationError("You are not authorised to create Work in this facility.");
    }
    const additionalFacilityIds = await this.resolveAdditionalFacilities(facilityId, input.additionalFacilityRefs);
    // New Job Order Work has no Approval or Job Order yet, so it cannot be created as already executing.
    const executionBlock = jobOrderExecutionBlock({
      route: input.commercialRoute,
      status: input.status,
      approvalStatus: null,
      hasJobOrder: false,
    });
    if (executionBlock) throw new FmWorkValidationError(executionBlock);
    if (input.assignedToProfileId) {
      await this.assertAssigneeAtFacility(input.assignedToProfileId, [facilityId, ...additionalFacilityIds]);
    }

    const sourceRequestId = input.sourceRequestRef
      ? await this.resolveRequestId(input.sourceRequestRef)
      : null;

    const incidentId = input.incidentRef
      ? await this.resolveIncidentId(input.incidentRef)
      : null;

    const codes = await this.listCodes();
    const code = generateNextWorkCode(codes);

    const insert = {
      organisation_id: this.organisationId,
      code,
      facility_id: facilityId,
      title: input.title,
      description: input.description ?? null,
      work_kind: input.workKind,
      source: input.source,
      priority: input.priority,
      status: input.status,
      asset_id: (await this.resolveAssetRef(input.assetRef)) ?? null,
      source_request_id: sourceRequestId,
      incident_id: incidentId,
      assigned_to_profile_id: input.assignedToProfileId ?? null,
      reported_by_profile_id: input.reportedByProfileId ?? null,
      hold_reason: input.holdReason ?? null,
      // Legacy compatibility only: classified Work never writes requires_work_instruction (column default applies);
      // its execution basis and actual Work Instructions answer the question.
      ...(input.commercialRoute ? {} : { requires_work_instruction: input.requiresWorkInstruction }),
      commercial_route: input.commercialRoute ?? null,
      operational_event_id: input.operationalEventId ?? null,
      reported_at: input.reportedAt,
      due_at: input.dueAt ?? null,
      scheduled_start_at: input.scheduledStartAt ?? null,
      scheduled_end_at: input.scheduledEndAt ?? null,
      started_at: input.startedAt ?? null,
      completed_at: input.completedAt ?? null,
      completion_notes: input.completionNotes ?? null,
      category_id: input.categoryId ?? null,
      department: input.department ?? null,
      created_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
    };

    const { data, error } = await this.admin
      .from("fm_work")
      .insert(insert)
      .select(FM_WORK_SELECT)
      .single();

    if (error) throwDb(error, "Unable to create work.");
    if (!data) throw new FmWorkUnavailableError("Work create returned no row.");
    const created = asRow(data);
    await this.replaceCoveredFacilities(created.id, facilityId, additionalFacilityIds);
    return (await this.withRequestCodes([created]))[0]!;
  }

  async update(
    idOrCode: string,
    input: ParsedUpdateWork,
    actorProfileId: string
  ): Promise<{ row: FmWorkRow; previousStatus: string }> {
    const existing = await this.getByIdOrCode(idOrCode);
    if (!existing) {
      throw new FmWorkNotFoundError(`Work ${idOrCode} not found.`);
    }
    // Imported historical Work is evidence: refuse BEFORE any relation resolution or write. This covers edit, treat,
    // progress, complete, cancel (deactivate delegates here), assign, date/status/priority and relationship changes.
    if (existing.record_origin === "migrated_historical") throw new FmWorkReadOnlyError();
    assertCommercialRouteChangeAllowed(existing, input.commercialRoute ?? undefined);

    const facilityId = input.facilityId
      ? await this.resolveFacilityId(input.facilityId)
      : existing.facility_id;
    if (facilityId !== existing.facility_id && !this.scope.canOperateIn(facilityId)) {
      throw new FmWorkValidationError("You are not authorised to move Work to this facility.");
    }
    // Coverage ("Both") changes only when facilities are supplied; otherwise the Work keeps what it covers.
    const additionalFacilityIds =
      input.additionalFacilityRefs !== undefined
        ? await this.resolveAdditionalFacilities(facilityId, input.additionalFacilityRefs)
        : input.facilityId !== undefined && facilityId !== existing.facility_id
          ? []
          : (existing.covered_facility_ids ?? []).filter((id) => id !== facilityId);

    const assignee =
      input.assignedToProfileId !== undefined
        ? input.assignedToProfileId
        : existing.assigned_to_profile_id;

    if (assignee) {
      await this.assertAssigneeAtFacility(assignee, [facilityId, ...additionalFacilityIds]);
    }

    const nextStatus = input.status ?? existing.status;
    // Job Order Work: no start / completion before the client's Approval is granted and the Job Order is recorded.
    if (input.status !== undefined || input.commercialRoute !== undefined) {
      const executionBlock = jobOrderExecutionBlock({
        route: input.commercialRoute ?? existing.commercial_route,
        status: nextStatus,
        approvalStatus: existing.client_approval_status,
        hasJobOrder: existing.job_order_codes.length > 0,
      });
      if (executionBlock) throw new FmWorkValidationError(executionBlock);
    }
    // Work Order route: a submitted Work Order pins its Work at completed (the route cannot change once one exists).
    const reopenBlock = workReopenBlock({
      route: existing.commercial_route,
      fromStatus: existing.status,
      toStatus: nextStatus,
      hasWorkOrder: existing.work_instruction_codes.length > 0,
    });
    if (reopenBlock) throw new FmWorkValidationError(reopenBlock);
    let completedAt =
      input.completedAt !== undefined
        ? input.completedAt
        : existing.completed_at;
    if (nextStatus === "completed" && !completedAt) {
      completedAt = new Date().toISOString();
    }
    if (nextStatus !== "completed" && input.status !== undefined) {
      // Leaving completed is rare; keep completed_at unless explicitly cleared.
    }

    const patch: Record<string, unknown> = {
      updated_by_profile_id: actorProfileId,
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) {
      patch.description = input.description ?? null;
    }
    if (input.workKind !== undefined) patch.work_kind = input.workKind;
    if (input.source !== undefined) patch.source = input.source;
    if (input.categoryId !== undefined) {
      patch.category_id = input.categoryId ?? null;
    }
    if (input.department !== undefined) {
      patch.department = input.department ?? null;
    }
    if (input.facilityId !== undefined) patch.facility_id = facilityId;
    if (input.assetRef !== undefined) patch.asset_id = (await this.resolveAssetRef(input.assetRef)) ?? null;
    if (input.sourceRequestRef !== undefined) {
      patch.source_request_id = input.sourceRequestRef
        ? await this.resolveRequestId(input.sourceRequestRef)
        : null;
    }
    if (input.incidentRef !== undefined) {
      patch.incident_id = input.incidentRef
        ? await this.resolveIncidentId(input.incidentRef)
        : null;
    }
    if (input.assignedToProfileId !== undefined) {
      patch.assigned_to_profile_id = input.assignedToProfileId ?? null;
    }
    if (input.reportedByProfileId !== undefined) {
      patch.reported_by_profile_id = input.reportedByProfileId ?? null;
    }
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.status !== undefined) patch.status = input.status;
    if (input.holdReason !== undefined) {
      patch.hold_reason = input.holdReason ?? null;
    }
    // Legacy compatibility only: never written for classified Work.
    if (input.requiresWorkInstruction !== undefined && !(input.commercialRoute ?? existing.commercial_route)) {
      patch.requires_work_instruction = input.requiresWorkInstruction;
    }
    if (input.commercialRoute !== undefined) patch.commercial_route = input.commercialRoute;
    if (input.operationalEventId !== undefined) {
      patch.operational_event_id = input.operationalEventId ?? null;
    }
    if (input.reportedAt !== undefined) patch.reported_at = input.reportedAt;
    if (input.scheduledStartAt !== undefined) {
      patch.scheduled_start_at = input.scheduledStartAt ?? null;
    }
    if (input.scheduledEndAt !== undefined) {
      patch.scheduled_end_at = input.scheduledEndAt ?? null;
    }
    if (input.dueAt !== undefined) patch.due_at = input.dueAt ?? null;
    if (input.startedAt !== undefined) {
      patch.started_at = input.startedAt ?? null;
    }
    if (input.completedAt !== undefined || nextStatus === "completed") {
      patch.completed_at = completedAt ?? null;
    }
    if (input.completionNotes !== undefined) {
      patch.completion_notes = input.completionNotes ?? null;
    }

    const { data, error } = await this.admin
      .from("fm_work")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_WORK_SELECT)
      .single();

    if (error) throwDb(error, "Unable to update work.");
    if (!data) throw new FmWorkNotFoundError(`Work ${idOrCode} not found.`);
    if (input.additionalFacilityRefs !== undefined || input.facilityId !== undefined) {
      await this.replaceCoveredFacilities(existing.id, facilityId, additionalFacilityIds);
    }
    return {
      row: (await this.withRequestCodes([asRow(data)]))[0]!,
      previousStatus: existing.status,
    };
  }

  async deactivate(
    idOrCode: string,
    actorProfileId: string
  ): Promise<FmWorkRow> {
    const { row } = await this.update(
      idOrCode,
      { id: idOrCode, status: "cancelled" },
      actorProfileId
    );
    return row;
  }

  /** Resolve an Asset reference (UUID, or a code accepted as INPUT only) to its tenant UUID. */
  private async resolveAssetRef(ref: string | null | undefined): Promise<string | null | undefined> {
    if (ref === undefined) return undefined;
    if (ref === null || !ref.trim()) return null;
    const id = await new FmAssetRepository(this.organisationId, this.admin).findId(ref);
    if (!id) throw new FmWorkValidationError(`Asset ${ref.trim()} not found in this organisation.`);
    return id;
  }

  /** Active Work codes per Asset UUID — asset workload. */
  async activeByAssetIds(assetIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const refs = uuidsOnly(assetIds);
    if (refs.length === 0) return out;
    const { data, error } = await this.admin
      .from("fm_work")
      .select("code, asset_id")
      .eq("organisation_id", this.organisationId)
      .in("asset_id", refs)
      .in("status", ["requested", "triaged", "scheduled", "in_progress", "on_hold"])
      .order("code", { ascending: true });
    if (error) throwDb(error, "Unable to load asset Work workload.");
    for (const row of data ?? []) {
      const rec = row as { code: string; asset_id: string };
      out.set(rec.asset_id, [...(out.get(rec.asset_id) ?? []), String(rec.code)]);
    }
    return out;
  }
}
