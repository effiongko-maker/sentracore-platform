import { ActionError } from "@/lib/actions/errors";
import { receivableStatus, type FinanceReceivable } from "@/modules/platform-finance/domain/receivables";
import { PlatformFinanceRepository } from "@/modules/platform-finance/server/PlatformFinanceRepository";
import { createAdminClient } from "@/utils/supabase/admin";

type Actor = { organisationId: string; profileId: string };

export class PlatformFinanceReceivablesServerService {
  private readonly repo: PlatformFinanceRepository;
  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
  }

  async list(actor: Actor): Promise<FinanceReceivable[]> {
    await this.assertView(actor);
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!companyIds.length) return [];
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_receivables")
      // Invoice join is OPTIONAL: non-invoice (live client billing) receivables have no invoice or journal.
      .select("id,organisation_id,company_id,origin_type,invoice_id,counterparty_id,invoice_reference,invoice_date,due_date,client_reference,submitted_on,description,source_location,source_update,historical_fact_id,currency,original_amount,counterparty_display_name,counterparty_legal_name,counterparty_tax_registration_id,created_at,finance_invoices(finance_transaction_id,finance_transactions(journal_entry_id)),finance_companies!inner(name)")
      .eq("organisation_id", this.organisationId)
      .in("company_id", companyIds)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("submitted_on", { ascending: true });
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    const ids = (data ?? []).map((row) => String(row.id));
    const postedByReceivable = new Map<string, number>();
    const committedByReceivable = new Map<string, number>();
    if (ids.length) {
      const { data: allocations, error: allocationError } = await admin
        .from("finance_receipt_allocations")
        .select("receivable_id,amount,finance_receipts!inner(status)")
        .in("receivable_id", ids)
        .in("finance_receipts.status", ["confirmed", "posted"]);
      if (allocationError) throw new ActionError("INTERNAL_ERROR", allocationError.message);
      for (const allocation of allocations ?? []) {
        const id = String(allocation.receivable_id);
        const amount = Number(allocation.amount);
        const receipt = allocation.finance_receipts as unknown as { status: string };
        committedByReceivable.set(id, (committedByReceivable.get(id) ?? 0) + amount);
        if (receipt.status === "posted") postedByReceivable.set(id, (postedByReceivable.get(id) ?? 0) + amount);
      }
    }
    const factIds = [...new Set((data ?? []).map((row) => row.historical_fact_id).filter(Boolean))] as string[];
    const factCodes = new Map<string, string>();
    if (factIds.length) {
      const { data: facts, error: factError } = await admin
        .from("platform_finance_historical_commercial_facts")
        .select("id,code")
        .eq("organisation_id", this.organisationId)
        .in("id", factIds);
      if (factError) throw new ActionError("INTERNAL_ERROR", factError.message);
      for (const fact of facts ?? []) factCodes.set(String(fact.id), String(fact.code));
    }
    return (data ?? []).map((row) => this.mapRow(
      row as Record<string, unknown>,
      postedByReceivable.get(String(row.id)) ?? 0,
      committedByReceivable.get(String(row.id)) ?? 0,
      row.historical_fact_id ? factCodes.get(String(row.historical_fact_id)) ?? null : null
    ));
  }

  async get(actor: Actor, id: string): Promise<FinanceReceivable> {
    const rows = await this.list(actor);
    const found = rows.find((row) => row.id === id);
    if (!found) throw new ActionError("VALIDATION_ERROR", "Receivable not found.");
    return found;
  }

  private async assertView(actor: Actor) {
    if (actor.organisationId !== this.organisationId) throw new ActionError("FORBIDDEN", "Organisation mismatch.");
    const { data, error } = await createAdminClient()
      .from("finance_capability_grants")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", actor.profileId)
      .eq("capability", "platform_finance.receivable.view")
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    if (!data) throw new ActionError("FORBIDDEN", "Missing receivable view authority.");
  }

  private mapRow(row: Record<string, unknown>, posted: number, committed: number, historicalFactCode: string | null): FinanceReceivable {
    const invoice = (row.finance_invoices as Record<string, unknown> | null) ?? null;
    const transaction = (invoice?.finance_transactions as Record<string, unknown> | null) ?? null;
    const company = row.finance_companies as Record<string, unknown>;
    const originType = (row.origin_type as FinanceReceivable["originType"]) ?? "invoice";
    // Off-ledger receivables (no GL recognition) are settled by CONFIRMED receipts — posting never applies to them.
    const offLedger = originType !== "invoice";
    const settled = offLedger ? committed : posted;
    const originalAmount = Number(row.original_amount);
    const outstandingAmount = Math.max(0, originalAmount - settled);
    const availableToAllocate = Math.max(0, originalAmount - committed);
    return {
      id: row.id as string,
      organisationId: row.organisation_id as string,
      companyId: row.company_id as string,
      companyName: company.name as string,
      originType,
      offLedger,
      invoiceId: (row.invoice_id as string | null) ?? null,
      counterpartyId: row.counterparty_id as string,
      invoiceReference: (row.invoice_reference as string | null) ?? null,
      invoiceDate: (row.invoice_date as string | null) ?? null,
      dueDate: (row.due_date as string | null) ?? null,
      clientReference: (row.client_reference as string | null) ?? null,
      submittedOn: (row.submitted_on as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      sourceLocation: (row.source_location as string | null) ?? null,
      sourceUpdate: (row.source_update as string | null) ?? null,
      historicalFactCode,
      currency: row.currency as string,
      originalAmount,
      outstandingAmount,
      availableToAllocate,
      counterpartyDisplayName: row.counterparty_display_name as string,
      counterpartyLegalName: (row.counterparty_legal_name as string | null) ?? null,
      counterpartyTaxRegistrationId: (row.counterparty_tax_registration_id as string | null) ?? null,
      financeTransactionId: (invoice?.finance_transaction_id as string | null) ?? null,
      journalEntryId: (transaction?.journal_entry_id as string | null) ?? null,
      createdAt: row.created_at as string,
      status: outstandingAmount === 0 ? "settled" : settled > 0 ? "partially_settled" : receivableStatus((row.due_date as string | null) ?? null),
    };
  }
}
