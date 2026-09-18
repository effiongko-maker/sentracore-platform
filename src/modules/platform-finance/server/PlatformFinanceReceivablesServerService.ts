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
      .select("id,organisation_id,company_id,invoice_id,counterparty_id,invoice_reference,invoice_date,due_date,currency,original_amount,counterparty_display_name,counterparty_legal_name,counterparty_tax_registration_id,created_at,finance_invoices!inner(finance_transaction_id,finance_transactions!inner(journal_entry_id)),finance_companies!inner(name)")
      .eq("organisation_id", this.organisationId)
      .in("company_id", companyIds)
      .order("due_date", { ascending: true });
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return (data ?? []).map((row) => this.mapRow(row as Record<string, unknown>));
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

  private mapRow(row: Record<string, unknown>): FinanceReceivable {
    const invoice = row.finance_invoices as Record<string, unknown>;
    const transaction = invoice.finance_transactions as Record<string, unknown>;
    const company = row.finance_companies as Record<string, unknown>;
    const originalAmount = Number(row.original_amount);
    return {
      id: row.id as string,
      organisationId: row.organisation_id as string,
      companyId: row.company_id as string,
      companyName: company.name as string,
      invoiceId: row.invoice_id as string,
      counterpartyId: row.counterparty_id as string,
      invoiceReference: row.invoice_reference as string,
      invoiceDate: row.invoice_date as string,
      dueDate: row.due_date as string,
      currency: row.currency as string,
      originalAmount,
      outstandingAmount: originalAmount,
      counterpartyDisplayName: row.counterparty_display_name as string,
      counterpartyLegalName: (row.counterparty_legal_name as string | null) ?? null,
      counterpartyTaxRegistrationId: (row.counterparty_tax_registration_id as string | null) ?? null,
      financeTransactionId: invoice.finance_transaction_id as string,
      journalEntryId: transaction.journal_entry_id as string,
      createdAt: row.created_at as string,
      status: receivableStatus(row.due_date as string),
    };
  }
}
