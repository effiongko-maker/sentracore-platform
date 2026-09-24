import { ActionError } from "@/lib/actions/errors";
import {
  HISTORICAL_COMMERCIAL_FACT_RECORD_ORIGIN,
  deriveCommercialSpread,
  type DerivedCommercialSpread,
  type PlatformFinanceHistoricalCommercialFact,
  type PlatformFinanceHistoricalCommercialFactInput,
} from "@/modules/platform-finance/domain/historicalCommercialFacts";
import { createAdminClient } from "@/utils/supabase/admin";

type Row = {
  id: string;
  organisation_id: string;
  code: string;
  record_origin: string;
  description: string;
  submitted_amount: number | string | null;
  authorised_amount: number | string | null;
  amount_received: number | string | null;
  currency: string;
  source_payment_status: string | null;
  payment_datetime: string | null;
  payment_datetime_source_text: string | null;
  commercial_reference: string | null;
  source_counterparty_text: string | null;
  fm_work_id: string | null;
  fm_work_instruction_id: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id,organisation_id,code,record_origin,description,submitted_amount,authorised_amount,amount_received," +
  "currency,source_payment_status,payment_datetime,payment_datetime_source_text,commercial_reference," +
  "source_counterparty_text,fm_work_id,fm_work_instruction_id,created_by_profile_id,updated_by_profile_id," +
  "created_at,updated_at";

function toNumberOrNull(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: Row): PlatformFinanceHistoricalCommercialFact {
  if (row.record_origin !== HISTORICAL_COMMERCIAL_FACT_RECORD_ORIGIN) {
    // Defensive only — the DB check constraint already makes this unreachable.
    throw new ActionError(
      "INTERNAL_ERROR",
      `Historical commercial fact ${row.id} has an unexpected record_origin.`
    );
  }
  return {
    id: row.id,
    organisationId: row.organisation_id,
    code: row.code,
    recordOrigin: HISTORICAL_COMMERCIAL_FACT_RECORD_ORIGIN,
    description: row.description,
    submittedAmount: toNumberOrNull(row.submitted_amount),
    authorisedAmount: toNumberOrNull(row.authorised_amount),
    amountReceived: toNumberOrNull(row.amount_received),
    currency: row.currency,
    sourcePaymentStatus: row.source_payment_status,
    paymentDatetime: row.payment_datetime,
    paymentDatetimeSourceText: row.payment_datetime_source_text,
    commercialReference: row.commercial_reference,
    sourceCounterpartyText: row.source_counterparty_text,
    fmWorkId: row.fm_work_id,
    fmWorkInstructionId: row.fm_work_instruction_id,
    createdByProfileId: row.created_by_profile_id,
    updatedByProfileId: row.updated_by_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PlatformFinanceHistoricalFactsRepository {
  constructor(private readonly organisationId: string) {}

  async list(): Promise<PlatformFinanceHistoricalCommercialFact[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_finance_historical_commercial_facts")
      .select(SELECT_COLUMNS)
      .eq("organisation_id", this.organisationId)
      // Source payment date/time is the business chronology; codes reflect import order.
      // Undated evidence follows dated records. Code is unique within the organisation.
      .order("payment_datetime", { ascending: false, nullsFirst: false })
      .order("code", { ascending: true });
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return (data ?? []).map((row) => mapRow(row as unknown as Row));
  }

  async get(id: string): Promise<PlatformFinanceHistoricalCommercialFact | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_finance_historical_commercial_facts")
      .select(SELECT_COLUMNS)
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return data ? mapRow(data as unknown as Row) : null;
  }

  async getByCode(code: string): Promise<PlatformFinanceHistoricalCommercialFact | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_finance_historical_commercial_facts")
      .select(SELECT_COLUMNS)
      .eq("organisation_id", this.organisationId)
      .ilike("code", code)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return data ? mapRow(data as unknown as Row) : null;
  }

  /**
   * Import-only. record_origin is never accepted from the caller — the table default plus its immutability
   * trigger are the only source of truth. fmWorkId / fmWorkInstructionId must already be a governed CERTAIN
   * relationship (the caller is responsible for resolving that via the existing fm_migration_provenance ledger
   * before calling this — this repository does not infer or verify certainty, only that the FK resolves).
   */
  async create(
    input: PlatformFinanceHistoricalCommercialFactInput,
    actorProfileId: string | null
  ): Promise<PlatformFinanceHistoricalCommercialFact> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_finance_historical_commercial_facts")
      .insert({
        organisation_id: this.organisationId,
        code: input.code,
        description: input.description,
        submitted_amount: input.submittedAmount ?? null,
        authorised_amount: input.authorisedAmount ?? null,
        amount_received: input.amountReceived ?? null,
        currency: input.currency ?? "NGN",
        source_payment_status: input.sourcePaymentStatus ?? null,
        payment_datetime: input.paymentDatetime ?? null,
        payment_datetime_source_text: input.paymentDatetimeSourceText ?? null,
        commercial_reference: input.commercialReference ?? null,
        source_counterparty_text: input.sourceCounterpartyText ?? null,
        fm_work_id: input.fmWorkId ?? null,
        fm_work_instruction_id: input.fmWorkInstructionId ?? null,
        created_by_profile_id: actorProfileId,
        updated_by_profile_id: actorProfileId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new ActionError("VALIDATION_ERROR", error.message);
    return mapRow(data as unknown as Row);
  }

  /**
   * Read-time derived commercial spread for every fact linked to FM Work — never persisted. Facts with no
   * fm_work_id, or with neither authorisedAmount nor submittedAmount evidenced, are returned with spread: null.
   * Execution cost is the sum of fm_cost_records.actual_amount for the SAME organisation and the same work_id
   * (a Work may carry more than one cost record; the total is the evidenced execution cost for that Work).
   */
  async listWithDerivedSpread(): Promise<
    Array<{ fact: PlatformFinanceHistoricalCommercialFact; spread: DerivedCommercialSpread | null }>
  > {
    const facts = await this.list();
    const workIds = [...new Set(facts.map((f) => f.fmWorkId).filter((id): id is string => Boolean(id)))];

    const costByWorkId = new Map<string, number>();
    if (workIds.length) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("fm_cost_records")
        .select("work_id,actual_amount")
        .eq("organisation_id", this.organisationId)
        .in("work_id", workIds);
      if (error) throw new ActionError("INTERNAL_ERROR", error.message);
      for (const row of data ?? []) {
        const workId = row.work_id as string | null;
        if (!workId) continue;
        const amount = toNumberOrNull(row.actual_amount as number | string | null) ?? 0;
        costByWorkId.set(workId, (costByWorkId.get(workId) ?? 0) + amount);
      }
    }

    return facts.map((fact) => ({
      fact,
      spread: fact.fmWorkId
        ? deriveCommercialSpread(fact, costByWorkId.get(fact.fmWorkId) ?? null)
        : null,
    }));
  }

  /**
   * Full facts for a set of CERTAIN-linked FM Work ids. Intended for another domain's own server-side read path
   * (e.g. FM Cost Record detail, composing an operationally useful "Commercial Position" for the FM user) to
   * read the independently-sourced commercial figures for a Work it already knows about via a governed link.
   * This repository has no capability check of its own (that lives in PlatformFinanceHistoricalFactsServerService,
   * used by Platform Finance's own surfaces) — the calling domain's server layer is responsible for deciding
   * what, if anything, its own surface may present from this, and for never copying/persisting the values back
   * into its own tables. Platform Finance remains the sole authority for every value returned here.
   */
  async listFactsByWorkIds(workIds: string[]): Promise<Map<string, PlatformFinanceHistoricalCommercialFact[]>> {
    const map = new Map<string, PlatformFinanceHistoricalCommercialFact[]>();
    if (!workIds.length) return map;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_finance_historical_commercial_facts")
      .select(SELECT_COLUMNS)
      .eq("organisation_id", this.organisationId)
      .in("fm_work_id", workIds);
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    for (const row of (data ?? []) as unknown as Row[]) {
      const workId = row.fm_work_id;
      if (!workId) continue;
      const fact = mapRow(row);
      const list = map.get(workId) ?? [];
      list.push(fact);
      map.set(workId, list);
    }
    return map;
  }

  /**
   * Human-readable reference for a CERTAIN FM Work/WI link — code (+ title) only, never exposing a raw UUID to
   * the client. Cross-domain read (fm_work / fm_work_instructions are FM-owned), mirroring how FmCostServerService
   * reads this repository in reverse for its own restrained reference.
   */
  async resolveWorkRef(
    workId: string | null,
    workInstructionId: string | null
  ): Promise<{ workCode: string | null; workTitle: string | null; workInstructionCode: string | null }> {
    const admin = createAdminClient();
    let workCode: string | null = null;
    let workTitle: string | null = null;
    let workInstructionCode: string | null = null;
    if (workId) {
      const { data } = await admin
        .from("fm_work")
        .select("code,title")
        .eq("organisation_id", this.organisationId)
        .eq("id", workId)
        .maybeSingle();
      workCode = (data?.code as string | undefined) ?? null;
      workTitle = (data?.title as string | undefined) ?? null;
    }
    if (workInstructionId) {
      const { data } = await admin
        .from("fm_work_instructions")
        .select("code")
        .eq("organisation_id", this.organisationId)
        .eq("id", workInstructionId)
        .maybeSingle();
      workInstructionCode = (data?.code as string | undefined) ?? null;
    }
    return { workCode, workTitle, workInstructionCode };
  }

  /**
   * Source lineage for a single fact — human-readable only (workbook/sheet/row/reference/classification), never
   * the raw fingerprint or batch id. Detail-view only; never batched across a list.
   */
  async getProvenance(factId: string): Promise<{
    workbook: string;
    sourceSheet: string;
    sourceRow: number;
    sourceReference: string | null;
    classification: string;
  } | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("fm_migration_provenance")
      .select("workbook,source_sheet,source_row,source_reference,classification")
      .eq("organisation_id", this.organisationId)
      .eq("target_table", "platform_finance_historical_commercial_facts")
      .eq("target_id", factId)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    if (!data) return null;
    return {
      workbook: data.workbook as string,
      sourceSheet: data.source_sheet as string,
      sourceRow: data.source_row as number,
      sourceReference: (data.source_reference as string | null) ?? null,
      classification: data.classification as string,
    };
  }
}
