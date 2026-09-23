import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  NO_FACILITY_MATCH,
  UNRESTRICTED_REPO_SCOPE,
  type FmRepoScope,
} from "@/lib/access/facilityScope";
import type { ApprovalListParams } from "@/modules/approvals/types";
import {
  AWAITING_ACTION_STATUSES,
  FM_APPROVAL_SELECT,
  FmApprovalNotFoundError,
  FmApprovalUnavailableError,
  FmApprovalValidationError,
  UUID_RE,
  generateNextApprovalCode,
  sanitizeSearchTerm,
  type ApprovalFields,
  type FmApprovalActivityRow,
  type FmApprovalRelations,
  type FmApprovalRow,
  type ParsedApprovalActivity,
  type ParsedCreateApproval,
  type ParsedUpdateApproval,
} from "./fmApprovalDomain";

type AdminClient = ReturnType<typeof createAdminClient>;
const CODE_RETRY_LIMIT = 5;

/** Raised on the one-Approval-per-Work-Instruction unique index. */
export class FmApprovalAlreadyExistsError extends FmApprovalValidationError {
  constructor(message = "This Work Instruction already has an Approval.") {
    super(message);
    this.name = "FmApprovalAlreadyExistsError";
  }
}

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmApprovalUnavailableError("Approval storage is unavailable.");
  }
}

function violation(error: { code?: string; message?: string } | null, index?: string): boolean {
  const text = error?.message ?? "";
  return (
    (error?.code === "23505" || /duplicate key|unique constraint/i.test(text)) &&
    (!index || text.includes(index))
  );
}

function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = error?.message?.trim() || fallback;
  if (violation(error, "fm_approvals_org_work_instruction_uidx")) throw new FmApprovalAlreadyExistsError();
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    throw new FmApprovalValidationError("An approval with this reference already exists in the organisation.");
  }
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmApprovalValidationError("Approval references an invalid Work Instruction or profile for this organisation.");
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmApprovalValidationError(
      /decision/i.test(message)
        ? "A recorded decision needs a decision date, an outcome and the recording profile."
        : "Approval values failed validation."
    );
  }
  throw new FmApprovalUnavailableError("Approval storage is unavailable.");
}

const num = (v: unknown) => (v != null ? Number(v) : null);
const txt = (rec: Record<string, unknown>, key: string) => (rec[key] != null ? String(rec[key]) : null);

function asRow(value: unknown): FmApprovalRow {
  const rec = value as Record<string, unknown>;
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    code: String(rec.code ?? ""),
    work_instruction_id: txt(rec, "work_instruction_id"),
    title: String(rec.title ?? ""),
    approval_type: txt(rec, "approval_type"),
    status: String(rec.status ?? "draft"),
    description: txt(rec, "description"),
    reason: txt(rec, "reason"),
    cover_letter: txt(rec, "cover_letter"),
    template_id: txt(rec, "template_id"),
    client_name: txt(rec, "client_name"),
    client_address: txt(rec, "client_address"),
    approval_amount: num(rec.approval_amount),
    approved_amount: num(rec.approved_amount),
    currency: txt(rec, "currency"),
    requested_by_profile_id: txt(rec, "requested_by_profile_id"),
    decided_by_profile_id: txt(rec, "decided_by_profile_id"),
    generated_at: txt(rec, "generated_at"),
    submitted_at: txt(rec, "submitted_at"),
    decision_at: txt(rec, "decision_at"),
    decision_notes: txt(rec, "decision_notes"),
    decision_outcome: txt(rec, "decision_outcome"),
    decision_reference: txt(rec, "decision_reference"),
    expires_at: txt(rec, "expires_at"),
    submission_method: txt(rec, "submission_method"),
    submitted_to: txt(rec, "submitted_to"),
    submission_reference: txt(rec, "submission_reference"),
    acknowledgement_file_name: txt(rec, "acknowledgement_file_name"),
    acknowledgement_file_mime: txt(rec, "acknowledgement_file_mime"),
    acknowledgement_file_size: num(rec.acknowledgement_file_size),
    decision_document_file_name: txt(rec, "decision_document_file_name"),
    decision_document_file_mime: txt(rec, "decision_document_file_mime"),
    decision_document_file_size: num(rec.decision_document_file_size),
    last_follow_up_at: txt(rec, "last_follow_up_at"),
    source_note: txt(rec, "source_note"),
    created_by_profile_id: txt(rec, "created_by_profile_id"),
    updated_by_profile_id: txt(rec, "updated_by_profile_id"),
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

function toColumns(f: ApprovalFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) out[key] = value;
  };
  set("title", f.title);
  set("approval_type", f.approvalType);
  set("status", f.status);
  set("description", f.description);
  set("reason", f.reason);
  set("cover_letter", f.coverLetter);
  set("template_id", f.templateId);
  set("client_name", f.clientName);
  set("client_address", f.clientAddress);
  set("approval_amount", f.approvalAmount);
  set("approved_amount", f.approvedAmount);
  set("currency", f.currency);
  set("requested_by_profile_id", f.requestedByProfileId);
  set("decided_by_profile_id", f.decidedByProfileId);
  set("generated_at", f.generatedAt);
  set("submitted_at", f.submittedAt);
  set("decision_at", f.decisionAt);
  set("decision_notes", f.decisionNotes);
  set("decision_outcome", f.decisionOutcome);
  set("decision_reference", f.decisionReference);
  set("expires_at", f.expiresAt);
  set("submission_method", f.submissionMethod);
  set("submitted_to", f.submittedTo);
  set("submission_reference", f.submissionReference);
  set("acknowledgement_file_name", f.acknowledgementFileName);
  set("acknowledgement_file_mime", f.acknowledgementFileMime);
  set("acknowledgement_file_size", f.acknowledgementFileSize);
  set("decision_document_file_name", f.decisionDocumentFileName);
  set("decision_document_file_mime", f.decisionDocumentFileMime);
  set("decision_document_file_size", f.decisionDocumentFileSize);
  set("last_follow_up_at", f.lastFollowUpAt);
  return out;
}

type InstructionRef = { id: string; code: string; facility_id: string; asset_id: string | null; record_origin: string };

function assertWorkInstructionNotHistorical(wi: InstructionRef): void {
  if (wi.record_origin === "migrated_historical") {
    throw new FmApprovalValidationError(
      "Imported historical Work Instructions are read-only source records: an Approval cannot be raised against them."
    );
  }
}

export class FmApprovalRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db(),
    private readonly scope: FmRepoScope = UNRESTRICTED_REPO_SCOPE
  ) {}

  /**
   * Facility scope for Approvals. An Approval's facility is DERIVED through its Work Instruction (never stored); an
   * Approval without one is facility-less (visible in "All facilities" only). Returns a PostgREST `or` clause, or
   * null when unrestricted.
   */
  private async scopeClause(): Promise<string | null> {
    const read = this.scope.read;
    if (read.unrestricted) return null;
    const parts: string[] = [];
    if (read.facilityIds.length) {
      const ids: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await this.admin
          .from("fm_work_instructions")
          .select("id")
          .eq("organisation_id", this.organisationId)
          .in("facility_id", read.facilityIds)
          .order("id", { ascending: true })
          .range(offset, offset + 999);
        if (error) throwDb(error, "Unable to resolve facility scope.");
        const batch = (data ?? []).map((r) => String((r as { id: string }).id));
        ids.push(...batch);
        if (batch.length < 1000) break;
      }
      if (ids.length) parts.push(`work_instruction_id.in.(${ids.join(",")})`);
    }
    if (read.includeUnattributed) parts.push("work_instruction_id.is.null");
    return parts.length ? parts.join(",") : `id.eq.${NO_FACILITY_MATCH}`;
  }

  /** Direct reads obey the facility scope: out of scope is "not found". */
  private async scoped(row: FmApprovalRow | null): Promise<FmApprovalRow | null> {
    if (!row) return null;
    const read = this.scope.read;
    if (read.unrestricted) return row;
    if (!row.work_instruction_id) return read.includeUnattributed ? row : null;
    const { data, error } = await this.admin
      .from("fm_work_instructions")
      .select("facility_id")
      .eq("organisation_id", this.organisationId)
      .eq("id", row.work_instruction_id)
      .maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility scope.");
    const facilityId = (data as { facility_id?: string } | null)?.facility_id;
    return facilityId && read.facilityIds.includes(String(facilityId)) ? row : null;
  }

  /** Resolve a Work Instruction by UUID or display code — inside this organisation only. */
  async resolveWorkInstruction(ref: string): Promise<InstructionRef> {
    const target = ref.trim();
    const query = this.admin
      .from("fm_work_instructions")
      .select("id, code, facility_id, asset_id, record_origin")
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to resolve Work Instruction.");
    if (!data) throw new FmApprovalValidationError(`Work Instruction ${target} not found in this organisation.`);
    const rec = data as Record<string, unknown>;
    return {
      id: String(rec.id),
      code: String(rec.code),
      facility_id: String(rec.facility_id),
      asset_id: rec.asset_id != null ? String(rec.asset_id) : null,
      record_origin: rec.record_origin != null ? String(rec.record_origin) : "operational",
    };
  }

  async getByIdOrCode(idOrCode: string): Promise<FmApprovalRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const query = this.admin.from("fm_approvals").select(FM_APPROVAL_SELECT).eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target)
      ? await query.eq("id", target).maybeSingle()
      : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to load approval.");
    return this.scoped(data ? asRow(data) : null);
  }

  async getByWorkInstruction(workInstructionId: string): Promise<FmApprovalRow | null> {
    const { data, error } = await this.admin
      .from("fm_approvals")
      .select(FM_APPROVAL_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("work_instruction_id", workInstructionId)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load approval.");
    return this.scoped(data ? asRow(data) : null);
  }

  private async instructionIds(filter: { facilityId?: string; codeLike?: string }): Promise<string[]> {
    let query = this.admin.from("fm_work_instructions").select("id").eq("organisation_id", this.organisationId);
    if (filter.facilityId) query = query.eq("facility_id", filter.facilityId);
    if (filter.codeLike) query = query.ilike("code", `%${filter.codeLike}%`);
    const { data, error } = await query.limit(1000);
    if (error) throwDb(error, "Unable to resolve Work Instructions.");
    return (data ?? []).map((row) => String((row as { id: string }).id));
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

  async listPage(params: ApprovalListParams): Promise<{ rows: FmApprovalRow[]; total: number }> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 8;
    let query = this.admin
      .from("fm_approvals")
      .select(FM_APPROVAL_SELECT, { count: "exact" })
      .eq("organisation_id", this.organisationId);
    const scopeClause = await this.scopeClause();
    if (scopeClause) query = query.or(scopeClause);

    if (params.status && params.status !== "all") query = query.eq("status", params.status);
    if (params.type && params.type !== "all") query = query.eq("approval_type", params.type);

    if (params.workOrderId && params.workOrderId !== "all") {
      const wi = await this.resolveWorkInstruction(params.workOrderId).catch((error) => {
        if (error instanceof FmApprovalValidationError) return null;
        throw error;
      });
      if (!wi) return { rows: [], total: 0 };
      query = query.eq("work_instruction_id", wi.id);
    }
    if (params.facilityId && params.facilityId !== "all") {
      // Facility is inherited through the Work Instruction (never stored on the Approval).
      const facilityId = await this.facilityIdOrNull(params.facilityId);
      const ids = facilityId ? await this.instructionIds({ facilityId }) : [];
      if (ids.length === 0) return { rows: [], total: 0 };
      query = query.in("work_instruction_id", ids);
    }

    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      const wiIds = await this.instructionIds({ codeLike: search });
      const clauses = [`title.ilike.${like}`, `code.ilike.${like}`, `reason.ilike.${like}`, `approval_type.ilike.${like}`];
      if (wiIds.length) clauses.push(`work_instruction_id.in.(${wiIds.join(",")})`);
      query = query.or(clauses.join(","));
    }

    const sort = params.sort ?? "newest";
    const ordered =
      sort === "oldest"
        ? query.order("updated_at", { ascending: true }).order("code", { ascending: true })
        : sort === "title_asc"
          ? query.order("title", { ascending: true }).order("code", { ascending: true })
          : sort === "title_desc"
            ? query.order("title", { ascending: false }).order("code", { ascending: false })
            : query.order("updated_at", { ascending: false }).order("code", { ascending: false });
    const from = (page - 1) * pageSize;
    const { data, error, count } = await ordered.range(from, from + pageSize - 1);
    if (error) throwDb(error, "Unable to load approvals.");
    return { rows: (data ?? []).map(asRow), total: count ?? 0 };
  }

  /** Work Instruction context (code, facility, asset), activities and source provenance, in batched queries. */
  async relationsFor(rows: FmApprovalRow[]): Promise<Map<string, FmApprovalRelations>> {
    const out = new Map<string, FmApprovalRelations>();
    if (rows.length === 0) return out;
    // Source-register Approvals carry no Work Instruction: they simply have no Work Order / facility context.
    const instructionIds = [...new Set(rows.flatMap((r) => (r.work_instruction_id ? [r.work_instruction_id] : [])))];
    const [instructions, activities, provenance] = await Promise.all([
      instructionIds.length
        ? this.admin
            .from("fm_work_instructions")
            .select("id, code, facility_id, asset_id")
            .eq("organisation_id", this.organisationId)
            .in("id", instructionIds)
        : Promise.resolve({ data: [], error: null }),
      this.admin
        .from("fm_approval_activities")
        .select("id, approval_id, action, occurred_at, summary, actor_profile_id, data")
        .eq("organisation_id", this.organisationId)
        .in("approval_id", rows.map((r) => r.id))
        .order("occurred_at", { ascending: true }),
      this.admin
        .from("fm_migration_provenance")
        .select("target_id, workbook, source_sheet, source_row")
        .eq("organisation_id", this.organisationId)
        .eq("target_table", "fm_approvals")
        .in("target_id", rows.map((r) => r.id)),
    ]);
    if (instructions.error) throwDb(instructions.error, "Unable to load Work Instruction context.");
    if (activities.error) throwDb(activities.error, "Unable to load approval activity.");
    if (provenance.error) throwDb(provenance.error, "Unable to load approval provenance.");
    const sourceByApproval = new Map(
      (provenance.data ?? []).map((p) => {
        const rec = p as { target_id: string; workbook: string; source_sheet: string; source_row: number };
        return [rec.target_id, { workbook: rec.workbook, sheet: rec.source_sheet, row: Number(rec.source_row) }] as const;
      })
    );

    const byInstruction = new Map(
      (instructions.data ?? []).map((i) => {
        const rec = i as { id: string; code: string; facility_id: string; asset_id: string | null };
        return [rec.id, rec] as const;
      })
    );
    for (const row of rows) {
      const wi = row.work_instruction_id ? byInstruction.get(row.work_instruction_id) : undefined;
      out.set(row.id, {
        workInstructionCode: wi?.code,
        facilityId: wi?.facility_id,
        assetRef: wi?.asset_id ?? undefined,
        sourceRecord: sourceByApproval.get(row.id),
        activities: [],
      });
    }
    for (const entry of activities.data ?? []) {
      const rec = entry as FmApprovalActivityRow;
      out.get(rec.approval_id)?.activities.push(rec);
    }
    return out;
  }

  private async latestCodeForYear(year: number): Promise<string | null> {
    const { data, error } = await this.admin
      .from("fm_approvals")
      .select("code")
      .eq("organisation_id", this.organisationId)
      .ilike("code", `APR-${year}-%`)
      .order("code", { ascending: false })
      .limit(1);
    if (error) throwDb(error, "Unable to allocate approval reference.");
    return ((data ?? [])[0] as { code?: string } | undefined)?.code ?? null;
  }

  async create(input: ParsedCreateApproval, actorProfileId: string): Promise<FmApprovalRow> {
    const wi = await this.resolveWorkInstruction(input.workInstructionRef);
    if (!this.scope.canOperateIn(wi.facility_id)) {
      throw new FmApprovalValidationError("You are not authorised to raise approvals in this facility.");
    }
    // Imported historical Work Instructions are read-only evidence: no Approval is raised against them.
    assertWorkInstructionNotHistorical(wi);
    const columns = toColumns(input);
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generateNextApprovalCode(await this.latestCodeForYear(new Date().getUTCFullYear()));
      const { data, error } = await this.admin
        .from("fm_approvals")
        .insert({
          ...columns,
          organisation_id: this.organisationId,
          code,
          work_instruction_id: wi.id,
          generated_at: columns.generated_at ?? (["draft", "awaiting_decision"].includes(input.status) ? now : undefined),
          requested_by_profile_id: columns.requested_by_profile_id ?? actorProfileId,
          created_by_profile_id: actorProfileId,
          updated_by_profile_id: actorProfileId,
        })
        .select(FM_APPROVAL_SELECT)
        .single();
      if (error) {
        // A code collision retries; a second Approval for the instruction is an error.
        if (violation(error) && !violation(error, "fm_approvals_org_work_instruction_uidx") && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "Unable to create approval.");
      }
      if (!data) throw new FmApprovalUnavailableError("Approval create returned no row.");
      return asRow(data);
    }
    throw new FmApprovalUnavailableError("Unable to allocate approval reference.");
  }

  async update(
    input: ParsedUpdateApproval,
    actorProfileId: string
  ): Promise<{ row: FmApprovalRow; previousStatus: string }> {
    const existing = await this.getByIdOrCode(input.id);
    if (!existing) throw new FmApprovalNotFoundError(`Approval ${input.id} not found.`);
    const patch = toColumns(input);
    if (input.workInstructionRef) {
      const wi = await this.resolveWorkInstruction(input.workInstructionRef);
      if (wi.id !== existing.work_instruction_id) {
        assertWorkInstructionNotHistorical(wi);
        patch.work_instruction_id = wi.id;
      }
    }
    patch.updated_by_profile_id = actorProfileId;
    const { data, error } = await this.admin
      .from("fm_approvals")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_APPROVAL_SELECT)
      .single();
    if (error) throwDb(error, "Unable to update approval.");
    if (!data) throw new FmApprovalNotFoundError(`Approval ${input.id} not found.`);
    return { row: asRow(data), previousStatus: existing.status };
  }

  async addActivity(approvalId: string, entry: ParsedApprovalActivity): Promise<void> {
    const { error } = await this.admin.from("fm_approval_activities").insert({
      organisation_id: this.organisationId,
      approval_id: approvalId,
      action: entry.action,
      occurred_at: entry.at ?? new Date().toISOString(),
      summary: entry.summary,
      actor_profile_id: entry.actorProfileId ?? null,
      data: entry.data ?? {},
    });
    if (error) throwDb(error, "Unable to record approval activity.");
  }

  /** Complete-register statuses for the Operational Picture (one column only). */
  async operationalPictureStatuses(): Promise<Array<{ status: string }>> {
    const rows: Array<{ status: string }> = [];
    const scopeClause = await this.scopeClause();
    for (let offset = 0; ; offset += 1000) {
      let scoped = this.admin
        .from("fm_approvals")
        .select("status")
        .eq("organisation_id", this.organisationId)
        .in("status", [...AWAITING_ACTION_STATUSES]);
      if (scopeClause) scoped = scoped.or(scopeClause);
      const { data, error } = await scoped
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throwDb(error, "Unable to load Approval totals.");
      const batch = (data ?? []) as Array<{ status: string }>;
      rows.push(...batch);
      if (batch.length < 1000) return rows;
    }
  }
}
