import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  FM_WORK_SELECT,
  FmWorkNotFoundError,
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
    asset_ref: rec.asset_ref != null ? String(rec.asset_ref) : null,
    source_request_id:
      rec.source_request_id != null ? String(rec.source_request_id) : null,
    source_request_code: null,
    incident_id: rec.incident_id != null ? String(rec.incident_id) : null,
    incident_code: null,
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
    operational_event_id:
      rec.operational_event_id != null
        ? String(rec.operational_event_id)
        : null,
    reported_at: String(rec.reported_at ?? ""),
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
    private readonly admin: AdminClient = db()
  ) {}

  async listRows(): Promise<FmWorkRow[]> {
    const rows: FmWorkRow[] = [];
    const batchSize = 500;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.admin
        .from("fm_work")
        .select(FM_WORK_SELECT)
        .eq("organisation_id", this.organisationId)
        .order("reported_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throwDb(error, "Unable to load work.");
      const batch = (data ?? []).map(asRow);
      rows.push(...batch);
      if (batch.length < batchSize) return this.withRequestCodes(rows);
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
      if (data) return (await this.withRequestCodes([asRow(data)]))[0]!;
    }

    const { data, error } = await this.admin
      .from("fm_work")
      .select(FM_WORK_SELECT)
      .eq("organisation_id", this.organisationId)
      .ilike("code", target)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load work.");
    return data ? (await this.withRequestCodes([asRow(data)]))[0]! : null;
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
    if (requestIds.length === 0 && incidentIds.length === 0) return rows;

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
    const [requestCodes, incidentCodes] = await Promise.all([
      lookup("fm_requests", requestIds),
      lookup("fm_incidents", incidentIds),
    ]);
    return rows.map((row) => ({
      ...row,
      source_request_code: row.source_request_id
        ? (requestCodes.get(row.source_request_id) ?? null)
        : null,
      incident_code: row.incident_id
        ? (incidentCodes.get(row.incident_id) ?? null)
        : null,
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

  async assertAssigneeAtFacility(
    profileId: string,
    facilityId: string
  ): Promise<void> {
    const { data, error } = await this.admin
      .from("fm_facility_assignments")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .eq("facility_id", facilityId)
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
    if (input.assignedToProfileId) {
      await this.assertAssigneeAtFacility(
        input.assignedToProfileId,
        facilityId
      );
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
      asset_ref: input.assetRef ?? null,
      source_request_id: sourceRequestId,
      incident_id: incidentId,
      assigned_to_profile_id: input.assignedToProfileId ?? null,
      reported_by_profile_id: input.reportedByProfileId ?? null,
      hold_reason: input.holdReason ?? null,
      requires_work_instruction: input.requiresWorkInstruction,
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
    return (await this.withRequestCodes([asRow(data)]))[0]!;
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

    const facilityId = input.facilityId
      ? await this.resolveFacilityId(input.facilityId)
      : existing.facility_id;

    const assignee =
      input.assignedToProfileId !== undefined
        ? input.assignedToProfileId
        : existing.assigned_to_profile_id;

    if (assignee) {
      await this.assertAssigneeAtFacility(assignee, facilityId);
    }

    const nextStatus = input.status ?? existing.status;
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
    if (input.assetRef !== undefined) patch.asset_ref = input.assetRef ?? null;
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
    if (input.requiresWorkInstruction !== undefined) {
      patch.requires_work_instruction = input.requiresWorkInstruction;
    }
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
}
