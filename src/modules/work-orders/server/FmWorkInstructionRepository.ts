import "server-only";
import { FmAssetRepository } from "@/modules/assets/server/FmAssetRepository";
import { uuidsOnly } from "@/modules/assets/server/fmAssetDomain";
import { createAdminClient } from "@/utils/supabase/admin";
import type { WorkOrderListParams } from "@/modules/work-orders/types";
import {
  ACTIVE_INSTRUCTION_STATUSES,
  ASSIGNED_INSTRUCTION_STATUSES,
  FM_WORK_INSTRUCTION_SELECT,
  FmWorkInstructionNotFoundError,
  FmWorkInstructionUnavailableError,
  FmWorkInstructionValidationError,
  UUID_RE,
  generateNextInstructionCode,
  sanitizeSearchTerm,
  type FmWorkInstructionRelations,
  type FmWorkInstructionRow,
  type InstructionFields,
  type ParsedCreateInstruction,
  type ParsedUpdateInstruction,
} from "./fmWorkInstructionDomain";

type AdminClient = ReturnType<typeof createAdminClient>;
const CODE_RETRY_LIMIT = 5;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmWorkInstructionUnavailableError("Work Instruction storage is unavailable.");
  }
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message ?? "");
}

function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = error?.message?.trim() || fallback;
  if (isUniqueViolation(error)) {
    throw new FmWorkInstructionValidationError(
      "A work instruction with this reference already exists in the organisation."
    );
  }
  if (/_asset_fk/.test(message)) throw new FmWorkInstructionValidationError("The asset must exist in this organisation and belong to the same facility.");
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmWorkInstructionValidationError(
      "Work Instruction references an invalid Work, parent or profile for this organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmWorkInstructionValidationError("Work Instruction values failed validation.");
  }
  throw new FmWorkInstructionUnavailableError("Work Instruction storage is unavailable.");
}

const num = (v: unknown) => (v != null ? Number(v) : null);
const txt = (rec: Record<string, unknown>, key: string) => (rec[key] != null ? String(rec[key]) : null);

function asRow(value: unknown): FmWorkInstructionRow {
  const rec = value as Record<string, unknown>;
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    code: String(rec.code ?? ""),
    order_type: String(rec.order_type ?? ""),
    work_id: String(rec.work_id),
    facility_id: String(rec.facility_id),
    title: String(rec.title ?? ""),
    description: txt(rec, "description"),
    instruction_text: txt(rec, "instruction_text"),
    work_category: String(rec.work_category ?? "corrective"),
    maintenance_type: txt(rec, "maintenance_type"),
    source: String(rec.source ?? "manual"),
    category_id: txt(rec, "category_id"),
    asset_id: txt(rec, "asset_id"),
    parent_instruction_id: txt(rec, "parent_instruction_id"),
    reported_by_profile_id: txt(rec, "reported_by_profile_id"),
    assigned_to_profile_id: txt(rec, "assigned_to_profile_id"),
    status: String(rec.status ?? "open"),
    priority: String(rec.priority ?? "medium"),
    hold_reason: txt(rec, "hold_reason"),
    requested_at: String(rec.requested_at ?? ""),
    scheduled_start_at: txt(rec, "scheduled_start_at"),
    scheduled_end_at: txt(rec, "scheduled_end_at"),
    due_at: txt(rec, "due_at"),
    sla_due_at: txt(rec, "sla_due_at"),
    started_at: txt(rec, "started_at"),
    completed_at: txt(rec, "completed_at"),
    estimated_hours: num(rec.estimated_hours),
    actual_hours: num(rec.actual_hours),
    estimated_cost: num(rec.estimated_cost),
    actual_cost: num(rec.actual_cost),
    downtime_minutes: rec.downtime_minutes != null ? Number(rec.downtime_minutes) : null,
    completion_notes: txt(rec, "completion_notes"),
    work_performed: txt(rec, "work_performed"),
    requires_approval: Boolean(rec.requires_approval),
    operational_event_id: txt(rec, "operational_event_id"),
    created_by_profile_id: txt(rec, "created_by_profile_id"),
    updated_by_profile_id: txt(rec, "updated_by_profile_id"),
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

type WorkRef = { id: string; code: string; facility_id: string; incident_id: string | null };

function toColumns(f: InstructionFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) out[key] = value;
  };
  set("order_type", f.orderType);
  set("title", f.title);
  set("description", f.description);
  set("instruction_text", f.instructionText);
  set("work_category", f.workCategory);
  set("maintenance_type", f.maintenanceType);
  set("source", f.source);
  set("category_id", f.categoryId);
  set("asset_id", f.assetRef); // assetRef is already the resolved Asset UUID here
  set("reported_by_profile_id", f.reportedByProfileId);
  set("assigned_to_profile_id", f.assignedToProfileId);
  set("status", f.status);
  set("priority", f.priority);
  set("hold_reason", f.holdReason);
  set("requested_at", f.requestedAt);
  set("scheduled_start_at", f.scheduledStartAt);
  set("scheduled_end_at", f.scheduledEndAt);
  set("due_at", f.dueAt);
  set("sla_due_at", f.slaDueAt);
  set("started_at", f.startedAt);
  set("completed_at", f.completedAt);
  set("estimated_hours", f.estimatedHours);
  set("actual_hours", f.actualHours);
  set("estimated_cost", f.estimatedCost);
  set("actual_cost", f.actualCost);
  set("downtime_minutes", f.downtimeMinutes);
  set("completion_notes", f.completionNotes);
  set("work_performed", f.workPerformed);
  set("requires_approval", f.requiresApproval);
  set("operational_event_id", f.operationalEventId);
  return out;
}

export class FmWorkInstructionRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db()
  ) {}

  /** Resolve an Asset reference (UUID, or a code accepted as INPUT only) to its tenant UUID. */
  private async resolveAssetRef(ref: string | null | undefined): Promise<string | null | undefined> {
    if (ref === undefined) return undefined;
    if (ref === null || !ref.trim()) return null;
    const id = await new FmAssetRepository(this.organisationId, this.admin).findId(ref);
    if (!id) throw new FmWorkInstructionValidationError(`Asset ${ref.trim()} not found in this organisation.`);
    return id;
  }

  async resolveWork(workRef: string): Promise<WorkRef> {
    const target = workRef.trim();
    const query = this.admin
      .from("fm_work")
      .select("id, code, facility_id, incident_id")
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to resolve Work.");
    if (!data) {
      throw new FmWorkInstructionValidationError(`Work ${target} not found in this organisation.`);
    }
    const rec = data as Record<string, unknown>;
    return {
      id: String(rec.id),
      code: String(rec.code),
      facility_id: String(rec.facility_id),
      incident_id: rec.incident_id != null ? String(rec.incident_id) : null,
    };
  }

  private async facilityCode(facilityId: string): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_facilities")
      .select("code")
      .eq("organisation_id", this.organisationId)
      .eq("id", facilityId)
      .maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    return data ? String((data as { code: string }).code) : null;
  }

  /** Facility and Incident context are inherited from the Work; supplied values must agree. */
  private async assertInherited(work: WorkRef, fields: InstructionFields): Promise<void> {
    if (fields.assertFacilityRef) {
      const supplied = fields.assertFacilityRef.toLowerCase();
      const code = ((await this.facilityCode(work.facility_id)) ?? "").toLowerCase();
      if (supplied !== work.facility_id.toLowerCase() && supplied !== code) {
        throw new FmWorkInstructionValidationError(
          `Facility mismatch: a Work Instruction inherits the facility of its Work (${work.code}).`
        );
      }
    }
    if (fields.assertIncidentRef) {
      let incidentCode: string | null = null;
      if (work.incident_id) {
        const { data, error } = await this.admin
          .from("fm_incidents")
          .select("code")
          .eq("organisation_id", this.organisationId)
          .eq("id", work.incident_id)
          .maybeSingle();
        if (error) throwDb(error, "Unable to resolve Incident.");
        incidentCode = data ? String((data as { code: string }).code) : null;
      }
      const supplied = fields.assertIncidentRef.toLowerCase();
      if (!incidentCode || (supplied !== incidentCode.toLowerCase() && supplied !== work.incident_id?.toLowerCase())) {
        throw new FmWorkInstructionValidationError(
          `Incident mismatch: Incident context comes from the Work (${work.code}).`
        );
      }
    }
  }

  private async resolveParentId(ref: string): Promise<string> {
    const row = await this.getByIdOrCode(ref);
    if (!row) {
      throw new FmWorkInstructionValidationError(`Parent Work Instruction ${ref} not found in this organisation.`);
    }
    return row.id;
  }

  async getByIdOrCode(idOrCode: string): Promise<FmWorkInstructionRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const query = this.admin
      .from("fm_work_instructions")
      .select(FM_WORK_INSTRUCTION_SELECT)
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to load work instruction.");
    return data ? asRow(data) : null;
  }

  async listPage(params: WorkOrderListParams): Promise<{ rows: FmWorkInstructionRow[]; total: number }> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 8;
    let query = this.admin
      .from("fm_work_instructions")
      .select(FM_WORK_INSTRUCTION_SELECT, { count: "exact" })
      .eq("organisation_id", this.organisationId);

    if (params.status && params.status !== "all") query = query.eq("status", params.status);
    if (params.priority && params.priority !== "all") query = query.eq("priority", params.priority);
    if (params.type && params.type !== "all") query = query.eq("work_category", params.type);
    if (params.assetId && params.assetId !== "all") {
      if (!UUID_RE.test(params.assetId)) return { rows: [], total: 0 };
      query = query.eq("asset_id", params.assetId);
    }
    if (params.assignedToUserId && params.assignedToUserId !== "all") {
      if (!UUID_RE.test(params.assignedToUserId)) return { rows: [], total: 0 };
      query = query.eq("assigned_to_profile_id", params.assignedToUserId);
    }
    if (params.facilityId && params.facilityId !== "all") {
      const facilityId = await this.facilityIdOrNull(params.facilityId);
      if (!facilityId) return { rows: [], total: 0 };
      query = query.eq("facility_id", facilityId);
    }
    if (params.maintenanceId && params.maintenanceId !== "all") {
      const work = await this.resolveWork(params.maintenanceId).catch((error) => {
        if (error instanceof FmWorkInstructionValidationError) return null;
        throw error;
      });
      if (!work) return { rows: [], total: 0 };
      query = query.eq("work_id", work.id);
    }
    if (params.dueDate && params.dueDate !== "all") {
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      if (params.dueDate === "no_due") query = query.is("due_at", null);
      else if (params.dueDate === "overdue") query = query.lt("due_at", startOfToday.toISOString());
      else if (params.dueDate === "next_7_days") {
        query = query
          .gte("due_at", startOfToday.toISOString())
          .lte("due_at", new Date(startOfToday.getTime() + 7 * 86_400_000).toISOString());
      }
    }
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or(
        [`title.ilike.${like}`, `code.ilike.${like}`, `description.ilike.${like}`, `instruction_text.ilike.${like}`].join(",")
      );
    }

    const sort = params.sort ?? "newest";
    const ordered =
      sort === "oldest"
        ? query.order("created_at", { ascending: true }).order("code", { ascending: true })
        : sort === "title_asc"
          ? query.order("title", { ascending: true }).order("code", { ascending: true })
          : sort === "title_desc"
            ? query.order("title", { ascending: false }).order("code", { ascending: false })
            : query.order("created_at", { ascending: false }).order("code", { ascending: false });
    const from = (page - 1) * pageSize;
    const { data, error, count } = await ordered.range(from, from + pageSize - 1);
    if (error) throwDb(error, "Unable to load work instructions.");
    return { rows: (data ?? []).map(asRow), total: count ?? 0 };
  }

  private async facilityIdOrNull(value: string): Promise<string | null> {
    if (UUID_RE.test(value)) return value;
    const { data, error } = await this.admin
      .from("fm_facilities")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .ilike("code", value)
      .maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    return data ? String((data as { id: string }).id) : null;
  }

  /** Derive Work / Incident-through-Work / parent codes (three batched queries). */
  async relationsFor(rows: FmWorkInstructionRow[]): Promise<Map<string, FmWorkInstructionRelations>> {
    const out = new Map<string, FmWorkInstructionRelations>();
    if (rows.length === 0) return out;
    const workIds = [...new Set(rows.map((r) => r.work_id))];
    const parentIds = [...new Set(rows.map((r) => r.parent_instruction_id).filter((v): v is string => !!v))];

    const [work, parents, approvals] = await Promise.all([
      this.admin
        .from("fm_work")
        .select("id, code, incident_id")
        .eq("organisation_id", this.organisationId)
        .in("id", workIds),
      parentIds.length
        ? this.admin
            .from("fm_work_instructions")
            .select("id, code")
            .eq("organisation_id", this.organisationId)
            .in("id", parentIds)
        : Promise.resolve({ data: [], error: null }),
      // Approval is a separate downstream domain related by UUID (one per instruction).
      this.admin
        .from("fm_approvals")
        .select("code, work_instruction_id")
        .eq("organisation_id", this.organisationId)
        .in("work_instruction_id", rows.map((r) => r.id)),
    ]);
    if (work.error) throwDb(work.error, "Unable to load Work context.");
    if (approvals.error) throwDb(approvals.error, "Unable to load Approval context.");
    if (parents.error) throwDb(parents.error, "Unable to load parent instructions.");

    const incidentIds = [
      ...new Set((work.data ?? []).map((w) => (w as { incident_id: string | null }).incident_id).filter((v): v is string => !!v)),
    ];
    const incidents = incidentIds.length
      ? await this.admin
          .from("fm_incidents")
          .select("id, code")
          .eq("organisation_id", this.organisationId)
          .in("id", incidentIds)
      : { data: [], error: null };
    if (incidents.error) throwDb(incidents.error, "Unable to load Incident context.");

    const incidentCode = new Map((incidents.data ?? []).map((i) => [String((i as { id: string }).id), String((i as { code: string }).code)]));
    const workById = new Map(
      (work.data ?? []).map((w) => {
        const rec = w as { id: string; code: string; incident_id: string | null };
        return [rec.id, { code: rec.code, incident: rec.incident_id ? incidentCode.get(rec.incident_id) : undefined }];
      })
    );
    const parentCode = new Map((parents.data ?? []).map((p) => [String((p as { id: string }).id), String((p as { code: string }).code)]));
    const approvalCodeByInstruction = new Map(
      (approvals.data ?? []).map((a) => [
        String((a as { work_instruction_id: string }).work_instruction_id),
        String((a as { code: string }).code),
      ])
    );
    for (const row of rows) {
      const w = workById.get(row.work_id);
      out.set(row.id, {
        workCode: w?.code,
        incidentCode: w?.incident,
        parentCode: row.parent_instruction_id ? parentCode.get(row.parent_instruction_id) : undefined,
        approvalCode: approvalCodeByInstruction.get(row.id),
      });
    }
    return out;
  }

  private async latestCodeForYear(year: number): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_work_instructions")
      .select("code")
      .eq("organisation_id", this.organisationId)
      .ilike("code", `WO-${year}-%`)
      .order("code", { ascending: false })
      .limit(1);
    if (error) throwDb(error, "Unable to allocate work instruction reference.");
    return ((data ?? [])[0] as { code?: string } | undefined)?.code ?? null;
  }

  async create(input: ParsedCreateInstruction, actorProfileId: string): Promise<FmWorkInstructionRow> {
    const work = await this.resolveWork(input.workRef);
    await this.assertInherited(work, input);
    const parentId = input.parentRef ? await this.resolveParentId(input.parentRef) : null;
    const columns = toColumns({ ...input, assetRef: await this.resolveAssetRef(input.assetRef) });
    const now = new Date().toISOString();

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generateNextInstructionCode(await this.latestCodeForYear(new Date().getUTCFullYear()));
      const { data, error } = await this.admin
        .from("fm_work_instructions")
        .insert({
          ...columns,
          organisation_id: this.organisationId,
          code,
          work_id: work.id,
          facility_id: work.facility_id,
          parent_instruction_id: parentId,
          completed_at: columns.completed_at ?? (input.status === "completed" ? now : undefined),
          created_by_profile_id: actorProfileId,
          updated_by_profile_id: actorProfileId,
        })
        .select(FM_WORK_INSTRUCTION_SELECT)
        .single();
      if (error) {
        if (isUniqueViolation(error) && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "Unable to create work instruction.");
      }
      if (!data) throw new FmWorkInstructionUnavailableError("Work Instruction create returned no row.");
      return asRow(data);
    }
    throw new FmWorkInstructionUnavailableError("Unable to allocate work instruction reference.");
  }

  async update(
    input: ParsedUpdateInstruction,
    actorProfileId: string
  ): Promise<{ row: FmWorkInstructionRow; previousStatus: string }> {
    const existing = await this.getByIdOrCode(input.id);
    if (!existing) throw new FmWorkInstructionNotFoundError(`Work Instruction ${input.id} not found.`);

    const patch = toColumns({ ...input, assetRef: await this.resolveAssetRef(input.assetRef) });
    let workId = existing.work_id;
    let workRow: WorkRef | null = null;
    if (input.workRef) {
      workRow = await this.resolveWork(input.workRef);
      if (workRow.id !== existing.work_id) {
        patch.work_id = workRow.id;
        patch.facility_id = workRow.facility_id; // inherited
        workId = workRow.id;
      }
    }
    if (input.assertFacilityRef || input.assertIncidentRef) {
      await this.assertInherited(workRow ?? (await this.resolveWork(workId)), input);
    }
    if (input.parentRef !== undefined) {
      patch.parent_instruction_id = input.parentRef ? await this.resolveParentId(input.parentRef) : null;
      if (patch.parent_instruction_id === existing.id) {
        throw new FmWorkInstructionValidationError("A work instruction cannot be its own parent.");
      }
    }
    const nextStatus = input.status ?? existing.status;
    if (nextStatus === "completed" && !existing.completed_at && patch.completed_at == null) {
      patch.completed_at = new Date().toISOString();
    }
    patch.updated_by_profile_id = actorProfileId;

    const { data, error } = await this.admin
      .from("fm_work_instructions")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_WORK_INSTRUCTION_SELECT)
      .single();
    if (error) throwDb(error, "Unable to update work instruction.");
    if (!data) throw new FmWorkInstructionNotFoundError(`Work Instruction ${input.id} not found.`);
    return { row: asRow(data), previousStatus: existing.status };
  }

  /** Complete-register rows for the Operational Picture (three columns only). */
  async operationalPictureRows(): Promise<Array<{ status: string; due_at: string | null; sla_due_at: string | null }>> {
    const rows: Array<{ status: string; due_at: string | null; sla_due_at: string | null }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await this.admin
        .from("fm_work_instructions")
        .select("status, due_at, sla_due_at")
        .eq("organisation_id", this.organisationId)
        .in("status", [...ASSIGNED_INSTRUCTION_STATUSES])
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throwDb(error, "Unable to load Work Instruction totals.");
      const batch = (data ?? []) as typeof rows;
      rows.push(...batch);
      if (batch.length < 1000) return rows;
    }
  }

  /** Active instructions assigned to a profile (Command Centre / Home). */
  async countAssignedForProfile(profileId: string): Promise<number> {
    const { count, error } = await this.admin
      .from("fm_work_instructions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", this.organisationId)
      .eq("assigned_to_profile_id", profileId)
      .in("status", [...ASSIGNED_INSTRUCTION_STATUSES]);
    if (error) throwDb(error, "Unable to load Work Instruction workload.");
    return count ?? 0;
  }

  /** Active instruction codes per assignee profile / per Asset UUID (workload). */
  async activeWorkload(input: { userIds: string[]; assetIds: string[] }): Promise<{
    byUser: Map<string, string[]>;
    byAsset: Map<string, string[]>;
  }> {
    const byUser = new Map<string, string[]>();
    const byAsset = new Map<string, string[]>();
    const users = [...new Set(input.userIds.filter((id) => UUID_RE.test(id)))];
    const assets = uuidsOnly(input.assetIds);
    const run = async (column: "assigned_to_profile_id" | "asset_id", values: string[], into: Map<string, string[]>) => {
      if (values.length === 0) return;
      const { data, error } = await this.admin
        .from("fm_work_instructions")
        .select(`code, ${column}`)
        .eq("organisation_id", this.organisationId)
        .in(column, values)
        .in("status", [...ACTIVE_INSTRUCTION_STATUSES])
        .order("code", { ascending: true });
      if (error) throwDb(error, "Unable to load Work Instruction workload.");
      for (const row of (data ?? []) as unknown as Array<Record<string, string>>) {
        const key = row[column]!;
        into.set(key, [...(into.get(key) ?? []), String(row.code)]);
      }
    };
    await Promise.all([run("assigned_to_profile_id", users, byUser), run("asset_id", assets, byAsset)]);
    return { byUser, byAsset };
  }
}
