import "server-only";
import {
  FM_HISTORICAL_2025_SHEETS,
  FM_ORDER_REGISTER_SHEETS,
  FM_SOURCE_REGISTER_WORKBOOK,
  loadProvenanceTargetIds,
  notInList,
  type ProvenanceClient,
} from "@/lib/fm/sourceRegisterScope";
import {
  applyFacilityScope,
  scopeAllowsFacilities,
  UNRESTRICTED_REPO_SCOPE,
  type FmRepoScope,
} from "@/lib/access/facilityScope";
import { FmAssetRepository } from "@/modules/assets/server/FmAssetRepository";
import { uuidsOnly } from "@/modules/assets/server/fmAssetDomain";
import { createAdminClient } from "@/utils/supabase/admin";
import type { WorkOrderListParams, WorkOrderOrderType } from "@/modules/work-orders/types";
import {
  jobOrderIssueBlock,
  resolveInstructionOrderType,
  workOrderSubmissionBlock,
} from "@/modules/maintenance/commercialRoute";
import {
  ACTIVE_INSTRUCTION_STATUSES,
  ASSIGNED_INSTRUCTION_STATUSES,
  FM_WORK_INSTRUCTION_SELECT,
  FmWorkInstructionNotFoundError,
  FmWorkInstructionReadOnlyError,
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
  type ParsedCreateSubmission,
  type ParsedFollowUp,
  type ParsedUpdateSubmission,
  type WorkOrderSubmissionStatus,
  assertSubmissionComplete,
} from "./fmWorkInstructionDomain";
import type { CommercialFollowUp } from "@/modules/work-orders/types";
import { latestFollowUp } from "@/lib/fm/commercialFollowUp";

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
    work_id: rec.work_id != null ? String(rec.work_id) : null,
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
    // NULL = unknown request date (migrated historical only) — never coerced to "".
    requested_at: rec.requested_at != null ? String(rec.requested_at) : null,
    record_origin: rec.record_origin != null ? String(rec.record_origin) : "operational",
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
    client_reference: txt(rec, "client_reference"),
    operational_event_id: txt(rec, "operational_event_id"),
    submission_date: txt(rec, "submission_date"),
    submission_amount: num(rec.submission_amount),
    submission_status: txt(rec, "submission_status"),
    last_follow_up_at: txt(rec, "last_follow_up_at"),
    created_by_profile_id: txt(rec, "created_by_profile_id"),
    updated_by_profile_id: txt(rec, "updated_by_profile_id"),
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

type WorkRef = {
  id: string;
  code: string;
  facility_id: string;
  incident_id: string | null;
  record_origin: string;
  commercial_route: string | null;
  status: string;
};

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
  set("client_reference", f.clientReference);
  set("operational_event_id", f.operationalEventId);
  return out;
}

export class FmWorkInstructionRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db(),
    private readonly scope: FmRepoScope = UNRESTRICTED_REPO_SCOPE
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
      .select("id, code, facility_id, incident_id, record_origin, commercial_route, status")
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
      record_origin: rec.record_origin != null ? String(rec.record_origin) : "operational",
      commercial_route: rec.commercial_route != null ? String(rec.commercial_route) : null,
      status: String(rec.status ?? ""),
    };
  }

  /** Status of the Work-level client Approval (fm_approvals.work_id), or null when none was requested. */
  private async workApprovalStatus(workId: string): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_approvals")
      .select("status")
      .eq("organisation_id", this.organisationId)
      .eq("work_id", workId)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load the Work's client approval.");
    return data ? String((data as { status: string }).status) : null;
  }

  /**
   * Order Type follows the Work's execution basis (a mismatch is refused; legacy Work keeps the explicit selection),
   * and a Job Order on Job Order-route Work is recorded only after the client's Approval is granted.
   */
  private async resolveOrderTypeFor(work: WorkRef, supplied: WorkOrderOrderType | undefined): Promise<WorkOrderOrderType> {
    const resolved = resolveInstructionOrderType(work.commercial_route, supplied);
    if (!resolved.ok) throw new FmWorkInstructionValidationError(resolved.message);
    const issueBlock = jobOrderIssueBlock({
      route: work.commercial_route,
      orderType: resolved.orderType,
      approvalStatus: work.commercial_route === "job_order" ? await this.workApprovalStatus(work.id) : null,
    });
    if (issueBlock) throw new FmWorkInstructionValidationError(issueBlock);
    // Work Order route: the Work Order is submitted for completed Work only (it never authorises execution).
    const submissionBlock = workOrderSubmissionBlock({
      route: work.commercial_route,
      orderType: resolved.orderType,
      workStatus: work.status,
    });
    if (submissionBlock) throw new FmWorkInstructionValidationError(submissionBlock);
    return resolved.orderType;
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
    if (!data) return null;
    const row = asRow(data);
    // Direct reads obey the facility scope: out of scope is "not found".
    return scopeAllowsFacilities(this.scope.read, [row.facility_id]) ? row : null;
  }

  async listPage(params: WorkOrderListParams): Promise<{ rows: FmWorkInstructionRow[]; total: number }> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 8;
    let query = this.admin
      .from("fm_work_instructions")
      .select(FM_WORK_INSTRUCTION_SELECT, { count: "exact" })
      .eq("organisation_id", this.organisationId);
    query = applyFacilityScope(query, this.scope.read);
    // 2025 register history is preserved but kept out of the current operating picture unless asked for.
    if (!params.includeHistory) {
      const history = await this.historical2025Ids();
      if (history.length) query = query.not("id", "in", notInList(history));
    }
    if (params.orderType && params.orderType !== "all") query = query.eq("order_type", params.orderType);

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

  /** Work Instructions imported from the 2025 registers (governed provenance only). */
  async historical2025Ids(): Promise<string[]> {
    try {
      return await loadProvenanceTargetIds(this.admin as unknown as ProvenanceClient, {
        organisationId: this.organisationId,
        target: "fm_work_instructions",
        sheets: FM_HISTORICAL_2025_SHEETS,
      });
    } catch (error) {
      throwDb({ message: error instanceof Error ? error.message : undefined }, "Unable to load Work Instruction provenance.");
    }
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
    const instructionIds = rows.map((r) => r.id);
    const [links, extraFacilities, importedValues] = await Promise.all([
      this.admin
        .from("fm_work_instruction_works")
        .select("work_instruction_id, work_id")
        .eq("organisation_id", this.organisationId)
        .in("work_instruction_id", instructionIds),
      this.admin
        .from("fm_work_instruction_facilities")
        .select("work_instruction_id, facility_id")
        .eq("organisation_id", this.organisationId)
        .in("work_instruction_id", instructionIds),
      this.importedOrderValues(rows.filter((r) => r.record_origin === "migrated_historical").map((r) => r.id)),
    ]);
    if (links.error) throwDb(links.error, "Unable to load submitted Works.");
    if (extraFacilities.error) throwDb(extraFacilities.error, "Unable to load WO/JO facilities.");
    const linkedByInstruction = new Map<string, string[]>();
    for (const link of links.data ?? []) {
      const rec = link as { work_instruction_id: string; work_id: string };
      linkedByInstruction.set(rec.work_instruction_id, [...(linkedByInstruction.get(rec.work_instruction_id) ?? []), rec.work_id]);
    }
    const facilitiesByInstruction = new Map<string, string[]>();
    for (const f of extraFacilities.data ?? []) {
      const rec = f as { work_instruction_id: string; facility_id: string };
      facilitiesByInstruction.set(rec.work_instruction_id, [...(facilitiesByInstruction.get(rec.work_instruction_id) ?? []), rec.facility_id]);
    }

    const workIds = [
      ...new Set([
        ...rows.map((r) => r.work_id).filter((v): v is string => !!v),
        ...[...linkedByInstruction.values()].flat(),
      ]),
    ];
    const parentIds = [...new Set(rows.map((r) => r.parent_instruction_id).filter((v): v is string => !!v))];

    const [work, parents, approvals, clientPayments] = await Promise.all([
      workIds.length
        ? this.admin
            .from("fm_work")
            .select("id, code, incident_id, commercial_route")
            .eq("organisation_id", this.organisationId)
            .in("id", workIds)
        : Promise.resolve({ data: [], error: null }),
      parentIds.length
        ? this.admin
            .from("fm_work_instructions")
            .select("id, code")
            .eq("organisation_id", this.organisationId)
            .in("id", parentIds)
        : Promise.resolve({ data: [], error: null }),
      // Approval is a separate domain related by UUID: one per instruction, or the Work's client Approval (Job Order
      // route — it precedes the Job Order, so it belongs to the Work).
      this.admin
        .from("fm_approvals")
        .select("code, work_instruction_id, work_id")
        .eq("organisation_id", this.organisationId)
        .or(
          [
            `work_instruction_id.in.(${instructionIds.join(",")})`,
            ...(workIds.length ? [`work_id.in.(${workIds.join(",")})`] : []),
          ].join(",")
        ),
      // The Work Order's active Client Payment (fm_cost_submissions.work_instruction_id) — its receipt state stays there.
      this.admin
        .from("fm_cost_submissions")
        .select("code, work_instruction_id")
        .eq("organisation_id", this.organisationId)
        .neq("status", "cancelled")
        .in("work_instruction_id", rows.map((r) => r.id)),
    ]);
    if (clientPayments.error) throwDb(clientPayments.error, "Unable to load Client Payment context.");
    const clientPaymentByInstruction = new Map(
      (clientPayments.data ?? []).map((p) => [
        String((p as { work_instruction_id: string }).work_instruction_id),
        String((p as { code: string }).code),
      ])
    );
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
        const rec = w as { id: string; code: string; incident_id: string | null; commercial_route: string | null };
        const route =
          rec.commercial_route === "work_order" || rec.commercial_route === "job_order"
            ? (rec.commercial_route as WorkOrderOrderType)
            : undefined;
        return [rec.id, { code: rec.code, incident: rec.incident_id ? incidentCode.get(rec.incident_id) : undefined, route }];
      })
    );
    const parentCode = new Map((parents.data ?? []).map((p) => [String((p as { id: string }).id), String((p as { code: string }).code)]));
    const approvalCodeByInstruction = new Map<string, string>();
    const approvalCodeByWork = new Map<string, string>();
    for (const entry of approvals.data ?? []) {
      const rec = entry as { code: string; work_instruction_id: string | null; work_id: string | null };
      if (rec.work_instruction_id) approvalCodeByInstruction.set(rec.work_instruction_id, String(rec.code));
      if (rec.work_id) approvalCodeByWork.set(rec.work_id, String(rec.code));
    }
    for (const row of rows) {
      const w = row.work_id ? workById.get(row.work_id) : undefined;
      const submittedWorkIds = [...new Set([...(row.work_id ? [row.work_id] : []), ...(linkedByInstruction.get(row.id) ?? [])])];
      out.set(row.id, {
        workCode: w?.code,
        incidentCode: w?.incident,
        parentCode: row.parent_instruction_id ? parentCode.get(row.parent_instruction_id) : undefined,
        approvalCode:
          approvalCodeByInstruction.get(row.id) ??
          (row.order_type === "job_order" && row.work_id ? approvalCodeByWork.get(row.work_id) : undefined),
        workCommercialRoute: w?.route,
        clientPaymentCode: clientPaymentByInstruction.get(row.id),
        linkedWorkCodes: submittedWorkIds.map((id) => workById.get(id)?.code).filter((v): v is string => !!v),
        additionalFacilityIds: facilitiesByInstruction.get(row.id) ?? [],
        importedOrderValue: importedValues.get(row.id),
      });
    }
    return out;
  }

  /**
   * Imported WO/JO value: the amount stated by the WO/JO's OWN order-register source row, which was imported as an
   * fm_cost_records row linked to this Work Instruction. Read-time only (governed provenance), never copied.
   */
  private async importedOrderValues(instructionIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (instructionIds.length === 0) return out;
    const { data: costs, error } = await this.admin
      .from("fm_cost_records")
      .select("id, work_instruction_id, actual_amount")
      .eq("organisation_id", this.organisationId)
      .eq("record_origin", "migrated_historical")
      .in("work_instruction_id", instructionIds);
    if (error) throwDb(error, "Unable to load imported WO/JO values.");
    const rows = (costs ?? []) as Array<{ id: string; work_instruction_id: string; actual_amount: number }>;
    if (rows.length === 0) return out;
    const { data: prov, error: provError } = await this.admin
      .from("fm_migration_provenance")
      .select("target_id")
      .eq("organisation_id", this.organisationId)
      .eq("workbook", FM_SOURCE_REGISTER_WORKBOOK)
      .eq("target_table", "fm_cost_records")
      .in("source_sheet", [...FM_ORDER_REGISTER_SHEETS])
      .in("target_id", rows.map((r) => r.id));
    if (provError) throwDb(provError, "Unable to load imported WO/JO provenance.");
    const fromOrderRegister = new Set((prov ?? []).map((p) => String((p as { target_id: string }).target_id)));
    for (const row of rows) {
      if (!fromOrderRegister.has(String(row.id))) continue;
      const key = String(row.work_instruction_id);
      out.set(key, Math.round(((out.get(key) ?? 0) + (Number(row.actual_amount) || 0)) * 100) / 100);
    }
    return out;
  }

  /** Resolve facility refs (UUID or code) in tenant, refusing any the actor cannot operate in. */
  private async submissionFacilities(refs: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const ref of refs) {
      const id = await this.facilityIdOrNull(ref);
      if (!id) throw new FmWorkInstructionValidationError(`Facility ${ref} not found in this organisation.`);
      if (!this.scope.canOperateIn(id)) {
        throw new FmWorkInstructionValidationError("You are not authorised to submit Work Orders or Job Orders for this facility.");
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  /** Works submitted in a WO/JO: optional; each must be current Work within the WO/JO's facilities. */
  private async submissionWorks(refs: string[], facilityIds: string[]): Promise<WorkRef[]> {
    const works: WorkRef[] = [];
    for (const ref of refs) {
      const work = await this.resolveWork(ref);
      // Imported historical Work is evidence: it is never re-packaged into a new submission.
      if (work.record_origin === "migrated_historical") throw new FmWorkInstructionReadOnlyError(
        `${work.code} is imported historical Work and cannot be added to a new submission.`
      );
      if (!facilityIds.includes(work.facility_id)) {
        throw new FmWorkInstructionValidationError(`${work.code} belongs to a facility this WO/JO does not cover.`);
      }
      if (!works.some((w) => w.id === work.id)) works.push(work);
    }
    return works;
  }

  private async replaceSubmissionLinks(instructionId: string, works: WorkRef[] | undefined, extraFacilities: string[] | undefined, actor: string) {
    if (works) {
      const del = await this.admin.from("fm_work_instruction_works").delete().eq("organisation_id", this.organisationId).eq("work_instruction_id", instructionId);
      if (del.error) throwDb(del.error, "Unable to update submitted Works.");
      if (works.length) {
        const ins = await this.admin.from("fm_work_instruction_works").insert(
          works.map((w) => ({ organisation_id: this.organisationId, work_instruction_id: instructionId, work_id: w.id, created_by_profile_id: actor }))
        );
        if (ins.error) throwDb(ins.error, "Unable to link submitted Works.");
      }
    }
    if (extraFacilities) {
      const del = await this.admin.from("fm_work_instruction_facilities").delete().eq("organisation_id", this.organisationId).eq("work_instruction_id", instructionId);
      if (del.error) throwDb(del.error, "Unable to update WO/JO facilities.");
      if (extraFacilities.length) {
        const ins = await this.admin.from("fm_work_instruction_facilities").insert(
          extraFacilities.map((facility_id) => ({ organisation_id: this.organisationId, work_instruction_id: instructionId, facility_id }))
        );
        if (ins.error) throwDb(ins.error, "Unable to record WO/JO facilities.");
      }
    }
  }

  /**
   * Create a WO/JO directly as a commercial submission package — no Issue and no Work required (0..many Works may be
   * linked). Operational lifecycle fields are left to their schema defaults and are not presented: operations live on
   * Work. Order Type is the explicit selection; it is never inferred from the amount.
   */
  async createSubmission(input: ParsedCreateSubmission, actorProfileId: string): Promise<FmWorkInstructionRow> {
    const facilityIds = await this.submissionFacilities(input.facilityRefs);
    const works = await this.submissionWorks(input.workRefs, facilityIds);
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generateNextInstructionCode(await this.latestCodeForYear(new Date().getUTCFullYear()));
      const { data, error } = await this.admin
        .from("fm_work_instructions")
        .insert({
          organisation_id: this.organisationId,
          code,
          order_type: input.orderType,
          work_id: null,
          facility_id: facilityIds[0],
          title: input.title,
          submission_date: input.submissionDate,
          submission_amount: input.submissionAmount,
          submission_status: input.submissionStatus,
          created_by_profile_id: actorProfileId,
          updated_by_profile_id: actorProfileId,
        })
        .select(FM_WORK_INSTRUCTION_SELECT)
        .single();
      if (error) {
        if (isUniqueViolation(error) && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "Unable to create the submission.");
      }
      if (!data) throw new FmWorkInstructionUnavailableError("Submission create returned no row.");
      const row = asRow(data);
      await this.replaceSubmissionLinks(row.id, works, facilityIds.slice(1), actorProfileId);
      return row;
    }
    throw new FmWorkInstructionUnavailableError("Unable to allocate work instruction reference.");
  }

  /** Update a WO/JO's commercial submission facts (and, for a Work-less submission, its facilities and Works). */
  async updateSubmission(input: ParsedUpdateSubmission, actorProfileId: string): Promise<FmWorkInstructionRow> {
    const existing = await this.getByIdOrCode(input.id);
    if (!existing) throw new FmWorkInstructionNotFoundError(`Work Instruction ${input.id} not found.`);
    if (existing.record_origin === "migrated_historical") throw new FmWorkInstructionReadOnlyError();
    if (!this.scope.canOperateIn(existing.facility_id)) {
      throw new FmWorkInstructionValidationError("You are not authorised to change submissions for this facility.");
    }
    const patch: Record<string, unknown> = { updated_by_profile_id: actorProfileId };
    let facilityIds: string[] | undefined;
    if (input.facilityRefs) {
      // A Work-linked WO/JO inherits its facility from the Work; only a Work-less submission chooses its own.
      if (existing.work_id) throw new FmWorkInstructionValidationError("This WO/JO inherits its facility from its Work.");
      facilityIds = await this.submissionFacilities(input.facilityRefs);
      patch.facility_id = facilityIds[0];
    }
    if (input.title !== undefined) patch.title = input.title;
    if (input.orderType !== undefined && input.orderType !== existing.order_type) {
      if (existing.work_id) throw new FmWorkInstructionValidationError("Change the Order Type from its Work.");
      patch.order_type = input.orderType;
    }
    if (input.submissionDate !== undefined) patch.submission_date = input.submissionDate;
    if (input.submissionAmount !== undefined) patch.submission_amount = input.submissionAmount;
    if (input.submissionStatus !== undefined) patch.submission_status = input.submissionStatus;
    const merged = {
      submissionStatus: (input.submissionStatus ?? existing.submission_status) as WorkOrderSubmissionStatus | null,
      submissionDate: input.submissionDate !== undefined ? input.submissionDate : existing.submission_date,
      submissionAmount: input.submissionAmount !== undefined ? input.submissionAmount : existing.submission_amount,
    };
    if (!existing.work_id && !merged.submissionStatus) {
      throw new FmWorkInstructionValidationError("Submission status is required.");
    }
    assertSubmissionComplete(merged);
    const works = input.workRefs
      ? await this.submissionWorks(
          input.workRefs,
          facilityIds ?? [existing.facility_id, ...((await this.relationsFor([existing])).get(existing.id)?.additionalFacilityIds ?? [])]
        )
      : undefined;
    const { data, error } = await this.admin
      .from("fm_work_instructions")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_WORK_INSTRUCTION_SELECT)
      .single();
    if (error) throwDb(error, "Unable to update the submission.");
    if (!data) throw new FmWorkInstructionNotFoundError(`Work Instruction ${input.id} not found.`);
    await this.replaceSubmissionLinks(existing.id, works, facilityIds?.slice(1), actorProfileId);
    return asRow(data);
  }

  /** Record a follow-up (chasing) event. Never changes the submission status or any payment state. */
  async recordFollowUp(input: ParsedFollowUp, actorProfileId: string): Promise<FmWorkInstructionRow> {
    const existing = await this.getByIdOrCode(input.id);
    if (!existing) throw new FmWorkInstructionNotFoundError(`Work Instruction ${input.id} not found.`);
    if (existing.record_origin === "migrated_historical") throw new FmWorkInstructionReadOnlyError();
    if (!this.scope.canOperateIn(existing.facility_id)) {
      throw new FmWorkInstructionValidationError("You are not authorised to follow up submissions for this facility.");
    }
    const ins = await this.admin.from("fm_commercial_follow_ups").insert({
      organisation_id: this.organisationId,
      work_instruction_id: existing.id,
      followed_up_at: input.followedUpAt,
      method: input.method,
      contact_person: input.contactPerson,
      outcome_notes: input.outcomeNotes,
      next_follow_up_at: input.nextFollowUpAt,
      actor_profile_id: actorProfileId,
    });
    if (ins.error) throwDb(ins.error, "Unable to record the follow-up.");
    const latest = latestFollowUp(existing.last_follow_up_at, input.followedUpAt);
    const { data, error } = await this.admin
      .from("fm_work_instructions")
      .update({ last_follow_up_at: latest, updated_by_profile_id: actorProfileId })
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_WORK_INSTRUCTION_SELECT)
      .single();
    if (error) throwDb(error, "Unable to record the follow-up.");
    return asRow(data);
  }

  async listFollowUps(idOrCode: string): Promise<CommercialFollowUp[]> {
    const existing = await this.getByIdOrCode(idOrCode);
    if (!existing) throw new FmWorkInstructionNotFoundError(`Work Instruction ${idOrCode} not found.`);
    const { data, error } = await this.admin
      .from("fm_commercial_follow_ups")
      .select("id, followed_up_at, method, contact_person, outcome_notes, next_follow_up_at, actor_profile_id")
      .eq("organisation_id", this.organisationId)
      .eq("work_instruction_id", existing.id)
      .order("followed_up_at", { ascending: false })
      .order("id", { ascending: true });
    if (error) throwDb(error, "Unable to load follow-ups.");
    return (data ?? []).map((row) => {
      const rec = row as Record<string, string | null>;
      return {
        id: String(rec.id),
        followedUpAt: String(rec.followed_up_at),
        method: rec.method as CommercialFollowUp["method"],
        contactPerson: rec.contact_person ?? undefined,
        outcomeNotes: String(rec.outcome_notes),
        nextFollowUpAt: rec.next_follow_up_at ?? undefined,
        actorProfileId: rec.actor_profile_id ?? undefined,
      };
    });
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
    if (!this.scope.canOperateIn(work.facility_id)) {
      throw new FmWorkInstructionValidationError("You are not authorised to create Work Orders in this facility.");
    }
    // A Work Instruction cannot be attached to imported historical Work (that would alter the historical relationship).
    if (work.record_origin === "migrated_historical") throw new FmWorkInstructionReadOnlyError();
    await this.assertInherited(work, input);
    const orderType = await this.resolveOrderTypeFor(work, input.orderType);
    const parentId = input.parentRef ? await this.resolveParentId(input.parentRef) : null;
    const columns = toColumns({ ...input, orderType, assetRef: await this.resolveAssetRef(input.assetRef) });
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
    // Imported historical Work Instructions are evidence: refuse BEFORE any relation resolution or write.
    if (existing.record_origin === "migrated_historical") throw new FmWorkInstructionReadOnlyError();

    // A WO/JO created directly as a commercial submission has no Work lifecycle: it is edited as a submission.
    if (!existing.work_id) {
      throw new FmWorkInstructionValidationError("This WO/JO is a commercial submission — edit it with the submission form.");
    }
    const patch = toColumns({ ...input, assetRef: await this.resolveAssetRef(input.assetRef) });
    let workId: string = existing.work_id;
    let workRow: WorkRef | null = null;
    if (input.workRef) {
      workRow = await this.resolveWork(input.workRef);
      if (workRow.record_origin === "migrated_historical" && workRow.id !== existing.work_id) {
        throw new FmWorkInstructionReadOnlyError();
      }
      if (workRow.id !== existing.work_id) {
        patch.work_id = workRow.id;
        patch.facility_id = workRow.facility_id; // inherited
        workId = workRow.id;
      }
    }
    if (input.assertFacilityRef || input.assertIncidentRef) {
      await this.assertInherited(workRow ?? (await this.resolveWork(workId)), input);
    }
    // An Order Type change, or a move to other Work, must still agree with that Work's execution basis.
    if (input.orderType !== undefined || workId !== existing.work_id) {
      const target = workRow ?? (await this.resolveWork(workId));
      const orderType = input.orderType ?? (existing.order_type as WorkOrderOrderType);
      if (orderType !== existing.order_type || workId !== existing.work_id) {
        patch.order_type = await this.resolveOrderTypeFor(target, orderType);
      }
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
      const { data, error } = await applyFacilityScope(
        this.admin
          .from("fm_work_instructions")
          .select("status, due_at, sla_due_at")
          .eq("organisation_id", this.organisationId)
          // A commercial submission has no operational lifecycle — operations live on Work.
          .is("submission_status", null)
          .in("status", [...ASSIGNED_INSTRUCTION_STATUSES]),
        this.scope.read
      )
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throwDb(error, "Unable to load Work Instruction totals.");
      const batch = (data ?? []) as typeof rows;
      rows.push(...batch);
      if (batch.length < 1000) return rows;
    }
  }

  /**
   * Complete-register count of Work Instructions with no recorded lifecycle status
   * (migrated historical) — distinct from and never counted toward the Operational
   * Picture / assigned totals. Lets Home show "N historical records" instead of a
   * bare, unexplained zero. One lightweight COUNT query, no row data transferred.
   */
  async countUnrecordedStatus(): Promise<number> {
    // Current operating picture: 2025 register history is not counted.
    const history = await this.historical2025Ids();
    let query = applyFacilityScope(
      this.admin
        .from("fm_work_instructions")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", this.organisationId)
        .eq("status", "unknown"),
      this.scope.read
    );
    if (history.length) query = query.not("id", "in", notInList(history));
    const { count, error } = await query;
    if (error) throwDb(error, "Unable to load Work Instruction historical total.");
    return count ?? 0;
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
