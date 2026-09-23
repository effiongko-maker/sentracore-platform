import "server-only";
import { workOrderClientPaymentBlock } from "@/modules/maintenance/commercialRoute";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  applyFacilityScope,
  facilityScopeClause,
  UNRESTRICTED_REPO_SCOPE,
  type FmRepoScope,
} from "@/lib/access/facilityScope";
import {
  FM_AUTHORIZATION_SELECT,
  FM_COST_RECORD_SELECT,
  FM_COST_SUBMISSION_SELECT,
  FM_PAYMENT_SELECT,
  FmCostNotFoundError,
  FmCostReadOnlyError,
  FmCostUnavailableError,
  FmCostValidationError,
  LOCKING_SUBMISSION_STATUSES,
  UUID_RE,
  generateNextAuthorizationCode,
  generateNextCostCode,
  generateNextPaymentCode,
  generateNextSubmissionCode,
  sanitizeSearchTerm,
  type AuthorizationFields,
  type CostRecordListParams,
  type FmAuthorizationRow,
  type FmCostRecordRow,
  type FmCostSubmissionRow,
  type FmPaymentRow,
  type ParsedCreateCostRecord,
  type ParsedCreateSubmission,
  type ParsedUpdateCostRecord,
  type ParsedUpdatePayment,
  type ParsedUpdateSubmission,
  type PaymentFields,
  type SubmissionListParams,
  type SubmissionRelations,
  type SubmissionScopedListParams,
  type CostRecordRelations,
  COST_SOURCE_REGISTER_WORKBOOK,
  costRecordOperatingYear,
} from "./fmCostDomain";

type AdminClient = ReturnType<typeof createAdminClient>;
const CODE_RETRY_LIMIT = 5;

/** Errors raised by the DB guards that carry a user-meaningful message. */
const GUARD_MESSAGES =
  /Payment exceeds|Only submitted claims|Payments can only|authorization is required/i;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmCostUnavailableError("FM cost storage is unavailable.");
  }
}
function isUnique(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message ?? "");
}
function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = error?.message?.trim() || fallback;
  if (GUARD_MESSAGES.test(message)) throw new FmCostValidationError(message.replace(/^.*?(Payment exceeds|Only submitted|Payments can only|A reimbursement)/i, "$1"));
  if (isUnique(error)) throw new FmCostValidationError("A record with this reference already exists.");
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmCostValidationError(
      /work_fk|work_instruction_fk/.test(message)
        ? "The cost facility must match the facility of its Work / Work Instruction."
        : "The record references an invalid facility, Work, Work Instruction, claim, cost or profile for this organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) throw new FmCostValidationError("Values failed validation.");
  throw new FmCostUnavailableError("FM cost storage is unavailable.");
}
const num = (v: unknown) => (v != null ? Number(v) : null);
const txt = (rec: Record<string, unknown>, key: string) => (rec[key] != null ? String(rec[key]) : null);
const str = (rec: Record<string, unknown>, key: string) => String(rec[key] ?? "");

function costRow(rec: Record<string, unknown>): FmCostRecordRow {
  return {
    id: str(rec, "id"), organisation_id: str(rec, "organisation_id"), code: str(rec, "code"), recorded_at: txt(rec, "recorded_at"),
    facility_id: str(rec, "facility_id"), department_id: txt(rec, "department_id"), location: txt(rec, "location"),
    work_id: txt(rec, "work_id"), work_instruction_id: txt(rec, "work_instruction_id"), description: str(rec, "description"),
    category: txt(rec, "category"), budgeted_amount: num(rec.budgeted_amount), actual_amount: Number(rec.actual_amount),
    currency: str(rec, "currency"), reimbursability: str(rec, "reimbursability"), evidence_reference: txt(rec, "evidence_reference"),
    evidence_file_id: txt(rec, "evidence_file_id"), evidence_file_name: txt(rec, "evidence_file_name"),
    evidence_file_mime: txt(rec, "evidence_file_mime"), evidence_file_size: num(rec.evidence_file_size),
    evidence_file_url: txt(rec, "evidence_file_url"), notes: txt(rec, "notes"),
    recorded_by_profile_id: txt(rec, "recorded_by_profile_id"), created_by_profile_id: txt(rec, "created_by_profile_id"),
    updated_by_profile_id: txt(rec, "updated_by_profile_id"), created_at: str(rec, "created_at"), updated_at: str(rec, "updated_at"),
    record_origin: rec.record_origin != null ? String(rec.record_origin) : "operational",
  };
}
function submissionRow(rec: Record<string, unknown>): FmCostSubmissionRow {
  return {
    id: str(rec, "id"), organisation_id: str(rec, "organisation_id"), code: str(rec, "code"), status: str(rec, "status"), currency: str(rec, "currency"),
    claim_amount: num(rec.claim_amount), markup_amount: num(rec.markup_amount), markup_rate_percent: num(rec.markup_rate_percent),
    no_markup: rec.no_markup == null ? null : Boolean(rec.no_markup), facility_id: txt(rec, "facility_id"), department_id: txt(rec, "department_id"),
    period_label: txt(rec, "period_label"), submission_kind: txt(rec, "submission_kind"), package_reference: txt(rec, "package_reference"),
    description: txt(rec, "description"), client_location: txt(rec, "client_location"), source_note: txt(rec, "source_note"),
    package_type: txt(rec, "package_type"), package_date: txt(rec, "package_date"), package_notes: txt(rec, "package_notes"),
    approval_id: txt(rec, "approval_id"), submitted_at: txt(rec, "submitted_at"), submitted_by_profile_id: txt(rec, "submitted_by_profile_id"),
    work_instruction_id: txt(rec, "work_instruction_id"),
    queried_at: txt(rec, "queried_at"), query_notes: txt(rec, "query_notes"), notes: txt(rec, "notes"),
    created_by_profile_id: txt(rec, "created_by_profile_id"), updated_by_profile_id: txt(rec, "updated_by_profile_id"),
    created_at: str(rec, "created_at"), updated_at: str(rec, "updated_at"),
  };
}
function authorizationRow(rec: Record<string, unknown>): FmAuthorizationRow {
  return {
    id: str(rec, "id"), organisation_id: str(rec, "organisation_id"), code: str(rec, "code"), submission_id: str(rec, "submission_id"),
    authorized_amount: Number(rec.authorized_amount), currency: str(rec, "currency"), authorized_at: str(rec, "authorized_at"),
    authorized_by_profile_id: txt(rec, "authorized_by_profile_id"), authority_reference: txt(rec, "authority_reference"),
    notes: txt(rec, "notes"), recorded_at: str(rec, "recorded_at"), created_by_profile_id: txt(rec, "created_by_profile_id"),
    updated_by_profile_id: txt(rec, "updated_by_profile_id"), created_at: str(rec, "created_at"), updated_at: str(rec, "updated_at"),
  };
}
function paymentRow(rec: Record<string, unknown>): FmPaymentRow {
  return {
    id: str(rec, "id"), organisation_id: str(rec, "organisation_id"), code: str(rec, "code"), submission_id: str(rec, "submission_id"),
    received_amount: Number(rec.received_amount), currency: str(rec, "currency"), received_at: str(rec, "received_at"),
    reference: txt(rec, "reference"), method: txt(rec, "method"), evidence_reference: txt(rec, "evidence_reference"),
    notes: txt(rec, "notes"), recorded_at: str(rec, "recorded_at"), recorded_by_profile_id: txt(rec, "recorded_by_profile_id"),
    created_by_profile_id: txt(rec, "created_by_profile_id"), updated_by_profile_id: txt(rec, "updated_by_profile_id"),
    created_at: str(rec, "created_at"), updated_at: str(rec, "updated_at"),
  };
}

type Ref = { id: string; code: string; facility_id: string };

/** Client Payments are FM-wide: a row with no facility is admitted in every authorised facility context. */
const FM_WIDE_WHEN_NO_FACILITY = ["facility_id.is.null"];

/** `or` clause for raw aggregate loops (a match-all clause when unrestricted, so the call site stays uniform). */
function facilityScopeOr(scope: FmRepoScope): string {
  return facilityScopeClause(scope.read) ?? "id.not.is.null";
}

export class FmCostRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db(),
    private readonly scope: FmRepoScope = UNRESTRICTED_REPO_SCOPE
  ) {}

  /**
   * Client payment (submission) UUIDs inside the facility scope — null when unrestricted. Client Payments are FM-WIDE:
   * one with no facility is visible in every authorised facility context; one with a facility obeys facility scope.
   * Authorizations and receipts carry no facility of their own: they are in scope exactly when their client payment is
   * (derived, never copied).
   */
  private async submissionIdsInScope(): Promise<string[] | null> {
    if (this.scope.read.unrestricted) return null;
    const ids: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await applyFacilityScope(
        this.admin.from("fm_cost_submissions").select("id").eq("organisation_id", this.organisationId),
        this.scope.read,
        "facility_id",
        FM_WIDE_WHEN_NO_FACILITY
      )
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throwDb(error, "Unable to resolve facility scope.");
      const batch = (data ?? []).map((r) => String((r as { id: string }).id));
      ids.push(...batch);
      if (batch.length < 1000) return ids;
    }
  }

  // ------------------------------------------------------------- resolution

  private scoped(table: string, select: string) {
    return this.admin.from(table).select(select).eq("organisation_id", this.organisationId);
  }
  private byIdOrCode<T>(query: T, target: string, codeUpper = true) {
    const q = query as unknown as { eq: (c: string, v: string) => unknown };
    return (UUID_RE.test(target) ? q.eq("id", target) : q.eq("code", codeUpper ? target.toUpperCase() : target)) as ReturnType<typeof this.scoped>;
  }

  async resolveFacilityId(ref: string): Promise<string> {
    const target = ref.trim();
    const query = this.admin.from("fm_facilities").select("id").eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target) ? await query.eq("id", target).maybeSingle() : await query.ilike("code", target).maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    if (!data) throw new FmCostValidationError("Facility not found in this organisation.");
    return String((data as { id: string }).id);
  }
  private async resolveDepartmentId(ref: string): Promise<string> {
    if (!UUID_RE.test(ref)) throw new FmCostValidationError("Department must be a department UUID.");
    const { data, error } = await this.admin.from("fm_departments").select("id").eq("organisation_id", this.organisationId).eq("id", ref).maybeSingle();
    if (error) throwDb(error, "Unable to resolve department.");
    if (!data) throw new FmCostValidationError("Department not found in this organisation.");
    return ref;
  }
  private async resolveRef(table: "fm_work" | "fm_work_instructions", ref: string, label: string): Promise<Ref> {
    const target = ref.trim();
    const query = this.admin.from(table).select("id, code, facility_id").eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target) ? await query.eq("id", target).maybeSingle() : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, `Unable to resolve ${label}.`);
    if (!data) throw new FmCostValidationError(`${label} ${target} not found in this organisation.`);
    const rec = data as Record<string, unknown>;
    return { id: str(rec, "id"), code: str(rec, "code"), facility_id: str(rec, "facility_id") };
  }
  private resolveWork(ref: string) {
    return this.resolveRef("fm_work", ref, "Work");
  }
  private resolveInstruction(ref: string) {
    return this.resolveRef("fm_work_instructions", ref, "Work Instruction");
  }
  private async resolveApprovalId(ref: string): Promise<string> {
    const target = ref.trim();
    const query = this.admin.from("fm_approvals").select("id").eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target) ? await query.eq("id", target).maybeSingle() : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to resolve approval.");
    if (!data) throw new FmCostValidationError(`Approval ${target} not found in this organisation.`);
    return String((data as { id: string }).id);
  }

  /**
   * Work Order route: resolve the Work Order a payment request bills. It must be an operational Work Order on Work
   * Order-route Work with no active Client Payment yet (the DB index / guard enforce the same).
   */
  private async resolveWorkOrderForPayment(ref: string, kind: string): Promise<string> {
    const target = ref.trim();
    const query = this.admin
      .from("fm_work_instructions")
      .select("id, code, order_type, record_origin, work_id")
      .eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target) ? await query.eq("id", target).maybeSingle() : await query.eq("code", target.toUpperCase()).maybeSingle();
    if (error) throwDb(error, "Unable to resolve Work Order.");
    if (!data) throw new FmCostValidationError(`Work Order ${target} not found in this organisation.`);
    const wi = data as { id: string; code: string; order_type: string; record_origin: string | null; work_id: string };
    const work = await this.admin.from("fm_work").select("commercial_route").eq("organisation_id", this.organisationId).eq("id", wi.work_id).maybeSingle();
    if (work.error) throwDb(work.error, "Unable to resolve Work.");
    const block = workOrderClientPaymentBlock({
      kind,
      orderType: wi.order_type,
      route: (work.data as { commercial_route?: string | null } | null)?.commercial_route ?? null,
      recordOrigin: wi.record_origin ?? "operational",
    });
    if (block) throw new FmCostValidationError(block);
    const existing = await this.admin
      .from("fm_cost_submissions").select("code").eq("organisation_id", this.organisationId)
      .eq("work_instruction_id", wi.id).neq("status", "cancelled").limit(1);
    if (existing.error) throwDb(existing.error, "Unable to check existing client payments.");
    const found = (existing.data ?? [])[0] as { code?: string } | undefined;
    if (found?.code) throw new FmCostValidationError(`Work Order ${wi.code} already has client payment ${found.code}.`);
    return wi.id;
  }

  private async latestCode(table: string, prefix: string): Promise<string | null> {
    const year = new Date().getUTCFullYear();
    const { data, error } = await this.admin
      .from(table).select("code").eq("organisation_id", this.organisationId).ilike("code", `${prefix}-${year}-%`)
      .order("code", { ascending: false }).limit(1);
    if (error) throwDb(error, "Unable to allocate reference.");
    return ((data ?? [])[0] as { code?: string } | undefined)?.code ?? null;
  }

  private async insertWithCode<T>(
    table: string,
    select: string,
    prefix: string,
    generate: (latest: string | null) => string,
    columns: Record<string, unknown>,
    map: (rec: Record<string, unknown>) => T
  ): Promise<T> {
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generate(await this.latestCode(table, prefix));
      const { data, error } = await this.admin
        .from(table).insert({ ...columns, organisation_id: this.organisationId, code }).select(select).single();
      if (error) {
        // Only a code collision retries (a claim-level unique violation must surface).
        if (isUnique(error) && /_code_uidx/.test(error.message ?? "") && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "Unable to create record.");
      }
      if (!data) throw new FmCostUnavailableError("Create returned no row.");
      return map(data as unknown as Record<string, unknown>);
    }
    throw new FmCostUnavailableError("Unable to allocate reference.");
  }

  // ------------------------------------------------------------ Cost Records

  async getCost(idOrCode: string): Promise<FmCostRecordRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    // Direct reads obey the facility scope: out of scope is "not found".
    const q = applyFacilityScope(this.scoped("fm_cost_records", FM_COST_RECORD_SELECT), this.scope.read);
    const { data, error } = await (UUID_RE.test(target) ? q.eq("id", target) : q.eq("code", target.toUpperCase())).maybeSingle();
    if (error) throwDb(error, "Unable to load cost record.");
    return data ? costRow(data as unknown as Record<string, unknown>) : null;
  }

  async listCosts(params: CostRecordListParams): Promise<{ rows: FmCostRecordRow[]; total: number }> {
    let query = applyFacilityScope(
      this.admin.from("fm_cost_records").select(FM_COST_RECORD_SELECT, { count: "exact" }).eq("organisation_id", this.organisationId),
      this.scope.read
    );
    if (params.category) query = query.eq("category", params.category);
    if (params.reimbursability) query = query.eq("reimbursability", params.reimbursability);
    if (params.facilityId) {
      const id = await this.resolveFacilityId(params.facilityId).catch((e) => (e instanceof FmCostValidationError ? null : Promise.reject(e)));
      if (!id) return { rows: [], total: 0 };
      query = query.eq("facility_id", id);
    }
    if (params.workId) {
      const work = await this.resolveWork(params.workId).catch((e) => (e instanceof FmCostValidationError ? null : Promise.reject(e)));
      if (!work) return { rows: [], total: 0 };
      query = query.eq("work_id", work.id);
    }
    if (params.workOrderId) {
      const wi = await this.resolveInstruction(params.workOrderId).catch((e) => (e instanceof FmCostValidationError ? null : Promise.reject(e)));
      if (!wi) return { rows: [], total: 0 };
      query = query.eq("work_instruction_id", wi.id);
    }
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or([`code.ilike.${like}`, `description.ilike.${like}`, `evidence_reference.ilike.${like}`].join(","));
    }
    const from = (params.page - 1) * params.pageSize;
    const { data, error, count } = await query
      .order("recorded_at", { ascending: false }).order("code", { ascending: false }).range(from, from + params.pageSize - 1);
    if (error) throwDb(error, "Unable to load cost records.");
    return { rows: (data ?? []).map((r) => costRow(r as unknown as Record<string, unknown>)), total: count ?? 0 };
  }

  async costRelations(rows: FmCostRecordRow[]): Promise<Map<string, CostRecordRelations>> {
    const out = new Map<string, CostRecordRelations>();
    if (rows.length === 0) return out;
    const lookup = async (table: "fm_work" | "fm_work_instructions", ids: string[]) => {
      const codes = new Map<string, string>();
      if (ids.length === 0) return codes;
      const { data, error } = await this.admin.from(table).select("id, code").eq("organisation_id", this.organisationId).in("id", ids);
      if (error) throwDb(error, "Unable to load cost context.");
      for (const r of data ?? []) codes.set(String((r as { id: string }).id), String((r as { code: string }).code));
      return codes;
    };
    const [work, wi] = await Promise.all([
      lookup("fm_work", [...new Set(rows.map((r) => r.work_id).filter((v): v is string => !!v))]),
      lookup("fm_work_instructions", [...new Set(rows.map((r) => r.work_instruction_id).filter((v): v is string => !!v))]),
    ]);
    for (const row of rows) {
      out.set(row.id, {
        workCode: row.work_id ? work.get(row.work_id) : undefined,
        workInstructionCode: row.work_instruction_id ? wi.get(row.work_instruction_id) : undefined,
      });
    }
    return out;
  }

  /** Code of the claim that locks this Cost Record (submitted/queried), if any. */
  async lockingSubmissionCode(costId: string): Promise<string | null> {
    const { data: items, error } = await this.admin
      .from("fm_cost_submission_items").select("submission_id").eq("organisation_id", this.organisationId).eq("cost_record_id", costId);
    if (error) throwDb(error, "Unable to check cost lock.");
    const ids = (items ?? []).map((i) => String((i as { submission_id: string }).submission_id));
    if (ids.length === 0) return null;
    const { data, error: subError } = await this.admin
      .from("fm_cost_submissions").select("code")
      .eq("organisation_id", this.organisationId).in("id", ids).in("status", [...LOCKING_SUBMISSION_STATUSES]).limit(1);
    if (subError) throwDb(subError, "Unable to check cost lock.");
    const row = (data ?? [])[0] as { code?: string } | undefined;
    return row?.code ?? null;
  }

  private async costContext(input: { facilityId: string; workRef?: string | null; workInstructionRef?: string | null }) {
    const work = input.workRef ? await this.resolveWork(input.workRef) : null;
    const wi = input.workInstructionRef ? await this.resolveInstruction(input.workInstructionRef) : null;
    for (const ctx of [work, wi]) {
      if (ctx && ctx.facility_id !== input.facilityId) {
        throw new FmCostValidationError(`The cost facility must match the facility of ${ctx.code}.`);
      }
    }
    return { workId: work?.id ?? null, workInstructionId: wi?.id ?? null };
  }

  /**
   * The authoritative total over the COMPLETE cost register — never a bounded "pool"/page. Pages through every row
   * (like FmWorkRepository.listRows) so the Costs & Claims headline is never a silent partial sum.
   */
  async aggregateTotals(): Promise<{
    totalCount: number;
    totalAmount: number;
    currency: string;
    liveUnclassifiedCount: number;
    historicalUnrecordedReimbursabilityCount: number;
    reimbursableCount: number;
    nonReimbursableCount: number;
  }> {
    let totalCount = 0, totalAmount = 0, liveUnclassifiedCount = 0, historicalUnrecordedReimbursabilityCount = 0, reimbursableCount = 0, nonReimbursableCount = 0;
    let currency = "NGN";
    const batchSize = 1000;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.admin
        .from("fm_cost_records")
        .select("actual_amount, currency, reimbursability, record_origin")
        .eq("organisation_id", this.organisationId)
        .or(facilityScopeOr(this.scope))
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throwDb(error, "Unable to load cost totals.");
      const batch = (data ?? []) as Array<{ actual_amount: number; currency: string; reimbursability: string; record_origin: string }>;
      for (const row of batch) {
        totalCount += 1;
        totalAmount += Number(row.actual_amount) || 0;
        currency = row.currency || currency;
        if (row.reimbursability === "unknown") {
          if (row.record_origin === "migrated_historical") historicalUnrecordedReimbursabilityCount += 1;
          else liveUnclassifiedCount += 1;
        } else if (row.reimbursability === "reimbursable") reimbursableCount += 1;
        else if (row.reimbursability === "non_reimbursable") nonReimbursableCount += 1;
      }
      if (batch.length < batchSize) break;
    }
    return { totalCount, totalAmount: Math.round(totalAmount * 100) / 100, currency, liveUnclassifiedCount, historicalUnrecordedReimbursabilityCount, reimbursableCount, nonReimbursableCount };
  }

  /**
   * Complete-register total for ONE operating year. Imported records are classified only by their source
   * register (governed provenance); native records by their own recorded_at. Records that cannot be classified
   * are excluded from the year and counted separately — never guessed.
   */
  async aggregateTotalsForYear(year: number): Promise<{
    operatingYear: number;
    totalCount: number;
    totalAmount: number;
    currency: string;
    unclassifiedCount: number;
  }> {
    const sheetByCost = new Map<string, string>();
    const batchSize = 1000;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.admin
        .from("fm_migration_provenance")
        .select("target_id, source_sheet")
        .eq("organisation_id", this.organisationId)
        .eq("target_table", "fm_cost_records")
        .eq("workbook", COST_SOURCE_REGISTER_WORKBOOK)
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throwDb(error, "Unable to load cost provenance.");
      const batch = (data ?? []) as Array<{ target_id: string; source_sheet: string }>;
      for (const row of batch) sheetByCost.set(String(row.target_id), String(row.source_sheet));
      if (batch.length < batchSize) break;
    }
    let totalCount = 0, totalAmount = 0, unclassifiedCount = 0;
    let currency = "NGN";
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await this.admin
        .from("fm_cost_records")
        .select("id, actual_amount, currency, record_origin, recorded_at")
        .eq("organisation_id", this.organisationId)
        .or(facilityScopeOr(this.scope))
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throwDb(error, "Unable to load cost totals.");
      const batch = (data ?? []) as Array<{ id: string; actual_amount: number; currency: string; record_origin: string; recorded_at: string | null }>;
      for (const row of batch) {
        const sheet = sheetByCost.get(String(row.id));
        const rowYear = costRecordOperatingYear({
          imported: sheet != null || row.record_origin === "migrated_historical",
          sourceSheet: sheet,
          recordedAt: row.recorded_at,
        });
        if (rowYear == null) {
          unclassifiedCount += 1;
          continue;
        }
        if (rowYear !== year) continue;
        totalCount += 1;
        totalAmount += Number(row.actual_amount) || 0;
        currency = row.currency || currency;
      }
      if (batch.length < batchSize) break;
    }
    return { operatingYear: year, totalCount, totalAmount: Math.round(totalAmount * 100) / 100, currency, unclassifiedCount };
  }

  async createCost(input: ParsedCreateCostRecord, actorProfileId: string): Promise<FmCostRecordRow> {
    const facilityId = await this.resolveFacilityId(input.facilityRef);
    if (!this.scope.canOperateIn(facilityId)) {
      throw new FmCostValidationError("You are not authorised to record costs in this facility.");
    }
    const ctx = await this.costContext({ facilityId, workRef: input.workRef, workInstructionRef: input.workInstructionRef });
    const departmentId = input.departmentId ? await this.resolveDepartmentId(input.departmentId) : null;
    return this.insertWithCode("fm_cost_records", FM_COST_RECORD_SELECT, "COST", (l) => generateNextCostCode(l), {
      recorded_at: input.recordedAt ?? new Date().toISOString(),
      facility_id: facilityId,
      department_id: departmentId,
      location: input.location,
      work_id: ctx.workId,
      work_instruction_id: ctx.workInstructionId,
      description: input.description,
      category: input.category,
      budgeted_amount: input.budgetedAmount ?? null,
      actual_amount: input.actualAmount,
      currency: input.currency,
      reimbursability: input.reimbursability,
      evidence_reference: input.evidenceReference,
      notes: input.notes ?? null,
      recorded_by_profile_id: actorProfileId,
      created_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
    }, (rec) => costRow(rec));
  }

  async updateCost(input: ParsedUpdateCostRecord, actorProfileId: string): Promise<FmCostRecordRow> {
    const existing = await this.getCost(input.id);
    if (!existing) throw new FmCostNotFoundError(`Cost record ${input.id} not found.`);
    if (existing.record_origin === "migrated_historical") throw new FmCostReadOnlyError();
    const facilityId = input.facilityRef ? await this.resolveFacilityId(input.facilityRef) : existing.facility_id;
    if (facilityId !== existing.facility_id && !this.scope.canOperateIn(facilityId)) {
      throw new FmCostValidationError("You are not authorised to move costs to this facility.");
    }
    const workRef = input.workRef !== undefined ? input.workRef : existing.work_id;
    const wiRef = input.workInstructionRef !== undefined ? input.workInstructionRef : existing.work_instruction_id;
    const ctx = await this.costContext({ facilityId, workRef, workInstructionRef: wiRef });
    const patch: Record<string, unknown> = { updated_by_profile_id: actorProfileId };
    const set = (k: string, v: unknown) => { if (v !== undefined) patch[k] = v; };
    set("recorded_at", input.recordedAt);
    if (input.facilityRef) patch.facility_id = facilityId;
    if (input.departmentId !== undefined) patch.department_id = input.departmentId ? await this.resolveDepartmentId(input.departmentId) : null;
    set("location", input.location);
    if (input.workRef !== undefined) patch.work_id = ctx.workId;
    if (input.workInstructionRef !== undefined) patch.work_instruction_id = ctx.workInstructionId;
    set("description", input.description);
    set("category", input.category);
    set("budgeted_amount", input.budgetedAmount);
    set("actual_amount", input.actualAmount);
    set("currency", input.currency);
    set("reimbursability", input.reimbursability);
    set("evidence_reference", input.evidenceReference);
    set("notes", input.notes);
    const { data, error } = await this.admin
      .from("fm_cost_records").update(patch).eq("organisation_id", this.organisationId).eq("id", existing.id)
      .select(FM_COST_RECORD_SELECT).single();
    if (error) throwDb(error, "Unable to update cost record.");
    return costRow(data as unknown as Record<string, unknown>);
  }

  // ----------------------------------------------------------- Submissions

  async getSubmission(idOrCode: string): Promise<FmCostSubmissionRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const q = applyFacilityScope(this.scoped("fm_cost_submissions", FM_COST_SUBMISSION_SELECT), this.scope.read, "facility_id", FM_WIDE_WHEN_NO_FACILITY);
    const { data, error } = await (UUID_RE.test(target) ? q.eq("id", target) : q.eq("code", target.toUpperCase())).maybeSingle();
    if (error) throwDb(error, "Unable to load cost submission.");
    return data ? submissionRow(data as unknown as Record<string, unknown>) : null;
  }

  async listSubmissions(params: SubmissionListParams): Promise<{ rows: FmCostSubmissionRow[]; total: number }> {
    let query = applyFacilityScope(
      this.admin.from("fm_cost_submissions").select(FM_COST_SUBMISSION_SELECT, { count: "exact" }).eq("organisation_id", this.organisationId),
      this.scope.read,
      "facility_id",
      FM_WIDE_WHEN_NO_FACILITY
    );
    if (params.status) query = query.eq("status", params.status);
    if (params.kind) query = query.eq("submission_kind", params.kind);
    if (params.facilityId) {
      const id = await this.resolveFacilityId(params.facilityId).catch((e) => (e instanceof FmCostValidationError ? null : Promise.reject(e)));
      if (!id) return { rows: [], total: 0 };
      query = query.eq("facility_id", id);
    }
    if (params.approvalId) {
      const id = await this.resolveApprovalId(params.approvalId).catch((e) => (e instanceof FmCostValidationError ? null : Promise.reject(e)));
      if (!id) return { rows: [], total: 0 };
      query = query.eq("approval_id", id);
    }
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or([`code.ilike.${like}`, `period_label.ilike.${like}`, `submission_kind.ilike.${like}`, `description.ilike.${like}`, `package_reference.ilike.${like}`, `notes.ilike.${like}`].join(","));
    }
    const from = (params.page - 1) * params.pageSize;
    const { data, error, count } = await query
      .order("created_at", { ascending: false }).order("code", { ascending: false }).range(from, from + params.pageSize - 1);
    if (error) throwDb(error, "Unable to load cost submissions.");
    return { rows: (data ?? []).map((r) => submissionRow(r as unknown as Record<string, unknown>)), total: count ?? 0 };
  }

  async submissionRelations(rows: FmCostSubmissionRow[]): Promise<Map<string, SubmissionRelations>> {
    const out = new Map<string, SubmissionRelations>();
    if (rows.length === 0) return out;
    const approvalIds = [...new Set(rows.map((r) => r.approval_id).filter((v): v is string => !!v))];
    const workOrderIds = [...new Set(rows.map((r) => r.work_instruction_id).filter((v): v is string => !!v))];
    const [items, approvals, workOrders] = await Promise.all([
      this.admin.from("fm_cost_submission_items").select("submission_id, cost_record_id").eq("organisation_id", this.organisationId).in("submission_id", rows.map((r) => r.id)).order("created_at", { ascending: true }),
      approvalIds.length
        ? this.admin.from("fm_approvals").select("id, code").eq("organisation_id", this.organisationId).in("id", approvalIds)
        : Promise.resolve({ data: [], error: null }),
      workOrderIds.length
        ? this.admin.from("fm_work_instructions").select("id, code").eq("organisation_id", this.organisationId).in("id", workOrderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (workOrders.error) throwDb(workOrders.error, "Unable to load client payment Work Orders.");
    const workOrderCode = new Map((workOrders.data ?? []).map((w) => [String((w as { id: string }).id), String((w as { code: string }).code)]));
    if (items.error) throwDb(items.error, "Unable to load claim costs.");
    if (approvals.error) throwDb(approvals.error, "Unable to load claim approvals.");
    const costIds = [...new Set((items.data ?? []).map((i) => String((i as { cost_record_id: string }).cost_record_id)))];
    const costs = costIds.length
      ? await this.admin.from("fm_cost_records").select("id, code").eq("organisation_id", this.organisationId).in("id", costIds)
      : { data: [], error: null };
    if (costs.error) throwDb(costs.error, "Unable to load claim costs.");
    const costCode = new Map((costs.data ?? []).map((c) => [String((c as { id: string }).id), String((c as { code: string }).code)]));
    const approvalCode = new Map((approvals.data ?? []).map((a) => [String((a as { id: string }).id), String((a as { code: string }).code)]));
    for (const row of rows) {
      out.set(row.id, {
        costCodes: [],
        approvalCode: row.approval_id ? approvalCode.get(row.approval_id) : undefined,
        workOrderCode: row.work_instruction_id ? workOrderCode.get(row.work_instruction_id) : undefined,
      });
    }
    for (const item of items.data ?? []) {
      const rec = item as { submission_id: string; cost_record_id: string };
      const code = costCode.get(rec.cost_record_id);
      if (code) out.get(rec.submission_id)?.costCodes.push(code);
    }
    return out;
  }

  async submissionCostCount(submissionId: string): Promise<number> {
    const { count, error } = await this.admin
      .from("fm_cost_submission_items").select("id", { count: "exact", head: true }).eq("organisation_id", this.organisationId).eq("submission_id", submissionId);
    if (error) throwDb(error, "Unable to count claim costs.");
    return count ?? 0;
  }

  private async resolveCostIds(refs: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const ref of refs) {
      const row = await this.getCost(ref);
      if (!row) throw new FmCostValidationError(`Cost record ${ref} not found in this organisation.`);
      ids.push(row.id);
    }
    return [...new Set(ids)];
  }

  private async replaceItems(submissionId: string, costIds: string[]): Promise<void> {
    const del = await this.admin.from("fm_cost_submission_items").delete().eq("organisation_id", this.organisationId).eq("submission_id", submissionId);
    if (del.error) throwDb(del.error, "Unable to update claim costs.");
    if (costIds.length === 0) return;
    const ins = await this.admin.from("fm_cost_submission_items").insert(
      costIds.map((cost_record_id) => ({ organisation_id: this.organisationId, submission_id: submissionId, cost_record_id }))
    );
    if (ins.error) throwDb(ins.error, "Unable to update claim costs.");
  }

  private submissionColumns(f: ParsedCreateSubmission | ParsedUpdateSubmission): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => { if (v !== undefined) out[k] = v; };
    set("status", f.status);
    set("currency", f.currency);
    set("claim_amount", f.claimAmount);
    set("markup_amount", f.markupAmount);
    set("markup_rate_percent", f.markupRatePercent);
    set("no_markup", f.noMarkup);
    set("period_label", f.periodLabel);
    set("submission_kind", f.submissionKind);
    set("description", f.description);
    set("client_location", f.clientLocation);
    set("package_reference", f.packageReference);
    set("package_type", f.packageType);
    set("package_date", f.packageDate);
    set("package_notes", f.packageNotes);
    set("submitted_at", f.submittedAt);
    set("queried_at", f.queriedAt);
    set("query_notes", f.queryNotes);
    set("notes", f.notes);
    return out;
  }

  async createSubmission(input: ParsedCreateSubmission, actorProfileId: string): Promise<FmCostSubmissionRow> {
    const costIds = await this.resolveCostIds(input.costRefs);
    const columns = this.submissionColumns(input);
    if (input.facilityRef !== undefined) columns.facility_id = input.facilityRef ? await this.resolveFacilityId(input.facilityRef) : null;
    if (columns.facility_id && !this.scope.canOperateIn(String(columns.facility_id))) {
      throw new FmCostValidationError("You are not authorised to create client payments in this facility.");
    }
    if (input.departmentId !== undefined) columns.department_id = input.departmentId ? await this.resolveDepartmentId(input.departmentId) : null;
    if (input.approvalRef !== undefined) columns.approval_id = input.approvalRef ? await this.resolveApprovalId(input.approvalRef) : null;
    if (input.workOrderRef) columns.work_instruction_id = await this.resolveWorkOrderForPayment(input.workOrderRef, input.submissionKind);
    const now = new Date().toISOString();
    if (input.status === "submitted" || input.status === "queried") {
      columns.submitted_at = columns.submitted_at ?? now;
      columns.submitted_by_profile_id = actorProfileId;
    }
    if (input.status === "queried") columns.queried_at = columns.queried_at ?? now;
    const row = await this.insertWithCode("fm_cost_submissions", FM_COST_SUBMISSION_SELECT, "SUB", (l) => generateNextSubmissionCode(l), {
      ...columns, created_by_profile_id: actorProfileId, updated_by_profile_id: actorProfileId,
    }, (rec) => submissionRow(rec));
    await this.replaceItems(row.id, costIds);
    return row;
  }

  async updateSubmission(input: ParsedUpdateSubmission, existing: FmCostSubmissionRow, actorProfileId: string): Promise<FmCostSubmissionRow> {
    if (input.workOrderRef !== undefined) {
      // Fixed at creation: echoing the current link is a no-op; any change is refused (the DB guard agrees).
      const target = input.workOrderRef.trim();
      const query = this.admin.from("fm_work_instructions").select("id").eq("organisation_id", this.organisationId);
      const { data, error } = UUID_RE.test(target) ? await query.eq("id", target).maybeSingle() : await query.eq("code", target.toUpperCase()).maybeSingle();
      if (error) throwDb(error, "Unable to resolve Work Order.");
      if (!data || String((data as { id: string }).id) !== existing.work_instruction_id) {
        throw new FmCostValidationError("A client payment's Work Order is set when it is created and cannot be changed.");
      }
    }
    const patch = this.submissionColumns(input);
    if (input.facilityRef !== undefined) patch.facility_id = input.facilityRef ? await this.resolveFacilityId(input.facilityRef) : null;
    if (patch.facility_id && patch.facility_id !== existing.facility_id && !this.scope.canOperateIn(String(patch.facility_id))) {
      throw new FmCostValidationError("You are not authorised to move client payments to this facility.");
    }
    if (input.departmentId !== undefined) patch.department_id = input.departmentId ? await this.resolveDepartmentId(input.departmentId) : null;
    if (input.approvalRef !== undefined) patch.approval_id = input.approvalRef ? await this.resolveApprovalId(input.approvalRef) : null;
    const now = new Date().toISOString();
    const next = input.status ?? existing.status;
    if ((next === "submitted" || next === "queried") && next !== existing.status) {
      patch.submitted_at = patch.submitted_at ?? now;
      patch.submitted_by_profile_id = actorProfileId;
    }
    if (next === "queried" && existing.status !== "queried") patch.queried_at = patch.queried_at ?? now;
    patch.updated_by_profile_id = actorProfileId;
    const costIds = input.costRefs ? await this.resolveCostIds(input.costRefs) : null;
    if (costIds) await this.replaceItems(existing.id, costIds);
    const { data, error } = await this.admin
      .from("fm_cost_submissions").update(patch).eq("organisation_id", this.organisationId).eq("id", existing.id)
      .select(FM_COST_SUBMISSION_SELECT).single();
    if (error) throwDb(error, "Unable to update cost submission.");
    return submissionRow(data as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------- shared submission lookups

  private async submissionCodes(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const { data, error } = await this.admin.from("fm_cost_submissions").select("id, code").eq("organisation_id", this.organisationId).in("id", [...new Set(ids)]);
    if (error) throwDb(error, "Unable to load claim references.");
    for (const r of data ?? []) out.set(String((r as { id: string }).id), String((r as { code: string }).code));
    return out;
  }
  async requireSubmission(ref: string): Promise<FmCostSubmissionRow> {
    const row = await this.getSubmission(ref);
    if (!row) throw new FmCostValidationError(`CostSubmission not found: ${ref}`);
    return row;
  }
  private async submissionIdForRef(ref: string): Promise<string | null> {
    return (await this.getSubmission(ref))?.id ?? null;
  }

  // -------------------------------------------------------- Authorizations

  async getAuthorization(idOrCode: string): Promise<{ row: FmAuthorizationRow; submissionCode: string } | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const q = this.scoped("fm_reimbursement_authorizations", FM_AUTHORIZATION_SELECT);
    const { data, error } = await (UUID_RE.test(target) ? q.eq("id", target) : q.eq("code", target.toUpperCase())).maybeSingle();
    if (error) throwDb(error, "Unable to load authorization.");
    if (!data) return null;
    const row = authorizationRow(data as unknown as Record<string, unknown>);
    if (!(await this.getSubmission(row.submission_id))) return null; // out of facility scope
    return { row, submissionCode: (await this.submissionCodes([row.submission_id])).get(row.submission_id) ?? "" };
  }

  async getAuthorizationForSubmission(submissionRef: string): Promise<{ row: FmAuthorizationRow; submissionCode: string } | null> {
    const submission = await this.getSubmission(submissionRef);
    if (!submission) return null;
    const { data, error } = await this.admin
      .from("fm_reimbursement_authorizations").select(FM_AUTHORIZATION_SELECT).eq("organisation_id", this.organisationId).eq("submission_id", submission.id).maybeSingle();
    if (error) throwDb(error, "Unable to load authorization.");
    return data ? { row: authorizationRow(data as unknown as Record<string, unknown>), submissionCode: submission.code } : null;
  }

  async listAuthorizations(params: SubmissionScopedListParams): Promise<{ rows: Array<{ row: FmAuthorizationRow; submissionCode: string }>; total: number }> {
    let query = this.admin.from("fm_reimbursement_authorizations").select(FM_AUTHORIZATION_SELECT, { count: "exact" }).eq("organisation_id", this.organisationId);
    const inScope = await this.submissionIdsInScope();
    if (inScope) {
      if (inScope.length === 0) return { rows: [], total: 0 };
      query = query.in("submission_id", inScope);
    }
    if (params.submissionId) {
      const id = await this.submissionIdForRef(params.submissionId);
      if (!id) return { rows: [], total: 0 };
      query = query.eq("submission_id", id);
    }
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or([`code.ilike.${like}`, `authority_reference.ilike.${like}`, `notes.ilike.${like}`].join(","));
    }
    const from = (params.page - 1) * params.pageSize;
    const { data, error, count } = await query.order("authorized_at", { ascending: false }).order("code", { ascending: false }).range(from, from + params.pageSize - 1);
    if (error) throwDb(error, "Unable to load authorizations.");
    const rows = (data ?? []).map((r) => authorizationRow(r as unknown as Record<string, unknown>));
    const codes = await this.submissionCodes(rows.map((r) => r.submission_id));
    return { rows: rows.map((row) => ({ row, submissionCode: codes.get(row.submission_id) ?? "" })), total: count ?? 0 };
  }

  async createAuthorization(input: AuthorizationFields & { submissionRef: string }, actorProfileId: string) {
    const submission = await this.requireSubmission(input.submissionRef);
    if (submission.status !== "submitted") {
      throw new FmCostValidationError("Only submitted claims can be authorized (queried claims must be resubmitted first)");
    }
    const existing = await this.getAuthorizationForSubmission(submission.id);
    if (existing) {
      throw new FmCostValidationError(`Claim already authorized (${existing.row.code}). Update the existing authorization instead.`);
    }
    const amount = input.authorizedAmount ?? submission.claim_amount;
    if (amount == null || Number(amount) <= 0) throw new FmCostValidationError("authorizedAmount must be a positive number.");
    const now = new Date().toISOString();
    const row = await this.insertWithCode("fm_reimbursement_authorizations", FM_AUTHORIZATION_SELECT, "AUTH", (l) => generateNextAuthorizationCode(l), {
      submission_id: submission.id,
      authorized_amount: amount,
      currency: input.currency ?? submission.currency,
      authorized_at: input.authorizedAt ?? now,
      authorized_by_profile_id: actorProfileId,
      authority_reference: input.authorityReference ?? null,
      notes: input.notes ?? null,
      recorded_at: now,
      created_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
    }, (rec) => authorizationRow(rec));
    return { row, submissionCode: submission.code };
  }

  async updateAuthorization(id: string, input: AuthorizationFields, actorProfileId: string) {
    const existing = await this.getAuthorization(id);
    if (!existing) throw new FmCostNotFoundError(`Authorization not found: ${id}`);
    const patch: Record<string, unknown> = { updated_by_profile_id: actorProfileId, authorized_by_profile_id: actorProfileId };
    const set = (k: string, v: unknown) => { if (v !== undefined) patch[k] = v; };
    set("authorized_amount", input.authorizedAmount);
    set("currency", input.currency);
    set("authorized_at", input.authorizedAt);
    set("authority_reference", input.authorityReference);
    set("notes", input.notes);
    const { data, error } = await this.admin
      .from("fm_reimbursement_authorizations").update(patch).eq("organisation_id", this.organisationId).eq("id", existing.row.id)
      .select(FM_AUTHORIZATION_SELECT).single();
    if (error) throwDb(error, "Unable to update authorization.");
    return { row: authorizationRow(data as unknown as Record<string, unknown>), submissionCode: existing.submissionCode };
  }

  // -------------------------------------------------------------- Payments

  async getPayment(idOrCode: string): Promise<{ row: FmPaymentRow; submissionCode: string } | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const q = this.scoped("fm_reimbursement_payments", FM_PAYMENT_SELECT);
    const { data, error } = await (UUID_RE.test(target) ? q.eq("id", target) : q.eq("code", target.toUpperCase())).maybeSingle();
    if (error) throwDb(error, "Unable to load payment.");
    if (!data) return null;
    const row = paymentRow(data as unknown as Record<string, unknown>);
    if (!(await this.getSubmission(row.submission_id))) return null; // out of facility scope
    return { row, submissionCode: (await this.submissionCodes([row.submission_id])).get(row.submission_id) ?? "" };
  }

  async listPayments(params: SubmissionScopedListParams): Promise<{ rows: Array<{ row: FmPaymentRow; submissionCode: string }>; total: number }> {
    let query = this.admin.from("fm_reimbursement_payments").select(FM_PAYMENT_SELECT, { count: "exact" }).eq("organisation_id", this.organisationId);
    const inScope = await this.submissionIdsInScope();
    if (inScope) {
      if (inScope.length === 0) return { rows: [], total: 0 };
      query = query.in("submission_id", inScope);
    }
    if (params.submissionId) {
      const id = await this.submissionIdForRef(params.submissionId);
      if (!id) return { rows: [], total: 0 };
      query = query.eq("submission_id", id);
    }
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or([`code.ilike.${like}`, `reference.ilike.${like}`, `method.ilike.${like}`, `evidence_reference.ilike.${like}`, `notes.ilike.${like}`].join(","));
    }
    const from = (params.page - 1) * params.pageSize;
    const { data, error, count } = await query.order("received_at", { ascending: false }).order("code", { ascending: false }).range(from, from + params.pageSize - 1);
    if (error) throwDb(error, "Unable to load payments.");
    const rows = (data ?? []).map((r) => paymentRow(r as unknown as Record<string, unknown>));
    const codes = await this.submissionCodes(rows.map((r) => r.submission_id));
    return { rows: rows.map((row) => ({ row, submissionCode: codes.get(row.submission_id) ?? "" })), total: count ?? 0 };
  }

  async createPayment(input: PaymentFields & { submissionRef: string; receivedAmount: number }, actorProfileId: string) {
    const submission = await this.requireSubmission(input.submissionRef);
    const now = new Date().toISOString();
    // The submitted/queried status, the authorization and the cumulative ceiling
    // are enforced by the fm_reimbursement_payments guard trigger (race-safe).
    const row = await this.insertWithCode("fm_reimbursement_payments", FM_PAYMENT_SELECT, "PAY", (l) => generateNextPaymentCode(l), {
      submission_id: submission.id,
      received_amount: input.receivedAmount,
      currency: input.currency ?? submission.currency,
      received_at: input.receivedAt ?? now,
      reference: input.reference ?? null,
      method: input.method ?? null,
      evidence_reference: input.evidenceReference ?? null,
      notes: input.notes ?? null,
      recorded_at: now,
      recorded_by_profile_id: actorProfileId,
      created_by_profile_id: actorProfileId,
      updated_by_profile_id: actorProfileId,
    }, (rec) => paymentRow(rec));
    return { row, submissionCode: submission.code };
  }

  async updatePayment(input: ParsedUpdatePayment, actorProfileId: string) {
    const existing = await this.getPayment(input.id);
    if (!existing) throw new FmCostNotFoundError(`Payment not found: ${input.id}`);
    const patch: Record<string, unknown> = { updated_by_profile_id: actorProfileId };
    const set = (k: string, v: unknown) => { if (v !== undefined) patch[k] = v; };
    if (input.submissionRef) patch.submission_id = (await this.requireSubmission(input.submissionRef)).id;
    set("received_amount", input.receivedAmount);
    set("currency", input.currency);
    set("received_at", input.receivedAt);
    set("reference", input.reference);
    set("method", input.method);
    set("evidence_reference", input.evidenceReference);
    set("notes", input.notes);
    const { data, error } = await this.admin
      .from("fm_reimbursement_payments").update(patch).eq("organisation_id", this.organisationId).eq("id", existing.row.id)
      .select(FM_PAYMENT_SELECT).single();
    if (error) throwDb(error, "Unable to update payment.");
    const row = paymentRow(data as unknown as Record<string, unknown>);
    return { row, submissionCode: (await this.submissionCodes([row.submission_id])).get(row.submission_id) ?? "" };
  }
}
