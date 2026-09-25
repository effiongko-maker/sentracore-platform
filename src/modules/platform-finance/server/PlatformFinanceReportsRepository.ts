import "server-only";
import { ActionError } from "@/lib/actions/errors";
import { createAdminClient } from "@/utils/supabase/admin";
import type { FinancePeriod } from "@/modules/platform-finance/types";
import type { JournalSourceRef, PostedLedgerLine } from "@/modules/platform-finance/reports/ledger";

/** A report never silently truncates: past this many posted lines the caller must narrow the period range. */
export const REPORT_LEDGER_LINE_LIMIT = 50_000;

const PAGE = 1000;
const IN_CHUNK = 200;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/**
 * Read-only projections for Reports. Posted journal lines come ONLY from finance_general_ledger_v, which is defined
 * over finance_journal_entries where status = 'posted' — draft transactions and draft entries cannot appear here.
 */
export class PlatformFinanceReportsRepository {
  constructor(private readonly organisationId: string) {}

  async listPostedLedgerLines(companyId: string, periods: readonly FinancePeriod[]): Promise<PostedLedgerLine[]> {
    if (!periods.length) return [];
    const periodById = new Map(periods.map((p) => [p.id, p]));
    const lines: PostedLedgerLine[] = [];
    for (const ids of chunks([...periodById.keys()], IN_CHUNK)) {
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await createAdminClient()
          .from("finance_general_ledger_v")
          .select(
            "journal_line_id, journal_entry_id, transaction_id, period_id, entry_date, entry_reference, entry_description, line_description, line_no, account_id, account_code, account_name, account_type, debit, credit, posted_at"
          )
          .eq("organisation_id", this.organisationId)
          .eq("company_id", companyId)
          .in("period_id", ids)
          .order("journal_line_id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw new ActionError("INTERNAL_ERROR", "Unable to load posted journal lines.");
        for (const row of data ?? []) {
          const period = periodById.get(String(row.period_id));
          if (!period) continue;
          lines.push({
            journalLineId: String(row.journal_line_id),
            journalEntryId: String(row.journal_entry_id),
            transactionId: String(row.transaction_id),
            periodId: period.id,
            year: period.year,
            month: period.month,
            entryDate: String(row.entry_date).slice(0, 10),
            reference: String(row.entry_reference),
            entryDescription: String(row.entry_description),
            lineDescription: (row.line_description as string | null) ?? null,
            lineNo: Number(row.line_no),
            accountId: String(row.account_id),
            accountCode: String(row.account_code),
            accountName: String(row.account_name),
            accountType: String(row.account_type),
            debit: Number(row.debit ?? 0),
            credit: Number(row.credit ?? 0),
            postedAt: String(row.posted_at),
          });
        }
        if (lines.length > REPORT_LEDGER_LINE_LIMIT) {
          throw new ActionError(
            "VALIDATION_ERROR",
            "This period range contains too many posted lines to report at once. Narrow the range or choose an account."
          );
        }
        if ((data ?? []).length < PAGE) break;
      }
    }
    return lines;
  }

  /** Provenance by source_type / source_id (never transaction_type); payments resolve their payable for drill-through. */
  async listTransactionSources(transactionIds: readonly string[]): Promise<Map<string, JournalSourceRef>> {
    const result = new Map<string, JournalSourceRef>();
    const unique = [...new Set(transactionIds)];
    const paymentIds: string[] = [];
    for (const ids of chunks(unique, IN_CHUNK)) {
      const { data, error } = await createAdminClient()
        .from("finance_transactions")
        .select("id, source_type, source_id")
        .eq("organisation_id", this.organisationId)
        .in("id", ids);
      if (error) throw new ActionError("INTERNAL_ERROR", "Unable to load journal provenance.");
      for (const row of data ?? []) {
        const sourceType = (row.source_type as string | null) ?? null;
        const sourceId = (row.source_id as string | null) ?? null;
        result.set(String(row.id), { sourceType, sourceId, payableId: null });
        if (sourceType === "payment" && sourceId) paymentIds.push(sourceId);
      }
    }
    if (paymentIds.length) {
      const payableByPayment = new Map<string, string>();
      for (const ids of chunks(paymentIds, IN_CHUNK)) {
        const { data, error } = await createAdminClient()
          .from("finance_payments")
          .select("id, payable_id")
          .eq("organisation_id", this.organisationId)
          .in("id", ids);
        if (error) throw new ActionError("INTERNAL_ERROR", "Unable to load payment provenance.");
        for (const row of data ?? []) payableByPayment.set(String(row.id), String(row.payable_id));
      }
      for (const ref of result.values()) {
        if (ref.sourceType === "payment" && ref.sourceId) ref.payableId = payableByPayment.get(ref.sourceId) ?? null;
      }
    }
    return result;
  }
}
