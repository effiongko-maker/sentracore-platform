import { randomBytes } from "node:crypto";
import { ActionError } from "@/lib/actions/errors";
import {
  computeInvoiceLineAmount,
  isRevenueGlEligible,
  type FinanceInvoice,
  type FinanceInvoiceDetail,
  type FinanceInvoiceLine,
  type InvoiceAccountingPreview,
  type InvoiceAccountingPreviewLine,
  type InvoiceStatus,
  roundMoney2,
} from "@/modules/platform-finance/domain/invoices";
import { PlatformFinanceRepository } from "@/modules/platform-finance/server/PlatformFinanceRepository";
import { PlatformFinanceServerService } from "@/modules/platform-finance/server/PlatformFinanceServerService";
import type { FinanceAccount } from "@/modules/platform-finance/types";
import { createAdminClient } from "@/utils/supabase/admin";

type Actor = { organisationId: string; profileId: string };

export type InvoiceCapabilities = {
  view: boolean;
  create: boolean;
  review: boolean;
  issue: boolean;
};

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  revenueGlAccountId: string;
};

export class PlatformFinanceInvoicesServerService {
  private readonly repo: PlatformFinanceRepository;
  private readonly accounting: PlatformFinanceServerService;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
    this.accounting = new PlatformFinanceServerService(organisationId);
  }

  async getMyCapabilities(actor: Actor): Promise<InvoiceCapabilities> {
    const caps = await this.loadCaps(actor.profileId);
    return {
      view:
        caps.has("platform_finance.invoice.view") ||
        caps.has("platform_finance.invoice.create") ||
        caps.has("platform_finance.invoice.review") ||
        caps.has("platform_finance.invoice.issue"),
      create: caps.has("platform_finance.invoice.create"),
      review: caps.has("platform_finance.invoice.review"),
      issue: caps.has("platform_finance.invoice.issue"),
    };
  }

  async listAccessibleCompanies(actor: Actor) {
    return this.accounting.listAccessibleCompanies(actor.profileId);
  }

  async listRevenueAccounts(actor: Actor): Promise<FinanceAccount[]> {
    await this.assertAnyInvoiceCap(actor);
    const accounts = await this.repo.listAccounts();
    return accounts.filter((account) =>
      isRevenueGlEligible(account, this.organisationId)
    );
  }

  async list(actor: Actor): Promise<FinanceInvoice[]> {
    await this.assertAnyInvoiceCap(actor);
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!companyIds.length) return [];
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_invoices")
      .select(
        "id,organisation_id,company_id,reference,counterparty_id,invoice_date,due_date,currency,description,status,total_amount,counterparty_display_name,counterparty_legal_name,counterparty_tax_registration_id,finance_transaction_id,created_by_profile_id,reviewed_by_profile_id,issued_by_profile_id,reviewed_at,issued_at,created_at,updated_at"
      )
      .eq("organisation_id", this.organisationId)
      .in("company_id", companyIds)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    const cpIds = [...new Set((data ?? []).map((r) => r.counterparty_id as string))];
    const nameById = new Map<string, string>();
    if (cpIds.length) {
      const { data: cps } = await admin
        .from("organisation_counterparties")
        .select("id,display_name")
        .eq("organisation_id", this.organisationId)
        .in("id", cpIds);
      for (const cp of cps ?? []) {
        nameById.set(cp.id as string, cp.display_name as string);
      }
    }
    return (data ?? []).map((r) => {
      const invoice = this.mapInvoice(r);
      if (!invoice.counterpartyDisplayName) {
        invoice.counterpartyDisplayName = nameById.get(invoice.counterpartyId) ?? null;
      }
      return invoice;
    });
  }

  async getDetail(actor: Actor, invoiceId: string): Promise<FinanceInvoiceDetail> {
    await this.assertAnyInvoiceCap(actor);
    const invoice = await this.loadInvoice(invoiceId);
    const accessible = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!accessible.includes(invoice.companyId)) {
      throw new ActionError("FORBIDDEN", "No company access.");
    }
    const admin = createAdminClient();
    const [{ data: company }, { data: cp }, { data: lines }, { data: ft }] = await Promise.all([
      admin.from("finance_companies").select("name").eq("id", invoice.companyId).maybeSingle(),
      admin
        .from("organisation_counterparties")
        .select("display_name")
        .eq("id", invoice.counterpartyId)
        .maybeSingle(),
      admin
        .from("finance_invoice_lines")
        .select(
          "id,invoice_id,line_no,description,quantity,unit_price,line_amount,revenue_gl_account_id,created_at"
        )
        .eq("invoice_id", invoiceId)
        .order("line_no", { ascending: true }),
      invoice.financeTransactionId
        ? admin
            .from("finance_transactions")
            .select("journal_entry_id")
            .eq("id", invoice.financeTransactionId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const glIds = [...new Set((lines ?? []).map((l) => l.revenue_gl_account_id as string))];
    const glById = new Map<string, FinanceAccount>();
    for (const id of glIds) {
      const account = await this.repo.getAccount(id);
      if (account) glById.set(id, account);
    }
    const mappedLines: FinanceInvoiceLine[] = (lines ?? []).map((l) => {
      const gl = glById.get(l.revenue_gl_account_id as string);
      return {
        id: l.id as string,
        invoiceId: l.invoice_id as string,
        lineNo: l.line_no as number,
        description: l.description as string,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        lineAmount: Number(l.line_amount),
        revenueGlAccountId: l.revenue_gl_account_id as string,
        revenueGlAccountCode: gl?.code,
        revenueGlAccountName: gl?.name,
        createdAt: l.created_at as string,
      };
    });
    const counterpartyName =
      invoice.status === "issued" && invoice.counterpartyDisplayName
        ? invoice.counterpartyDisplayName
        : (cp?.display_name as string | undefined) ?? invoice.counterpartyDisplayName ?? "Counterparty";
    return {
      ...invoice,
      companyName: (company?.name as string | undefined) ?? "Company",
      counterpartyName,
      lines: mappedLines,
      journalEntryId: (ft?.journal_entry_id as string | null | undefined) ?? null,
    };
  }

  async create(
    actor: Actor,
    input: {
      companyId: string;
      counterpartyId: string;
      invoiceDate: string;
      dueDate: string;
      currency?: string;
      description?: string | null;
      lines: InvoiceLineInput[];
    }
  ): Promise<FinanceInvoiceDetail> {
    await this.assertCreate(actor);
    await this.assertCompanyAccess(actor, input.companyId);
    await this.assertCustomerCounterparty(input.counterpartyId, { requireActive: true });
    if (!input.lines.length) throw new ActionError("VALIDATION_ERROR", "At least one line is required.");
    this.assertDates(input.invoiceDate, input.dueDate);
    const prepared = await this.prepareLines(input.lines);
    const total = roundMoney2(prepared.reduce((s, l) => s + l.lineAmount, 0));
    if (total <= 0) throw new ActionError("VALIDATION_ERROR", "Invoice total must be greater than zero.");

    const admin = createAdminClient();
    let reference = this.generateReference();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await admin
        .rpc("finance_invoice_create_draft", {
          p_actor_profile_id: actor.profileId,
          p_organisation_id: this.organisationId,
          p_company_id: input.companyId,
          p_reference: reference,
          p_counterparty_id: input.counterpartyId,
          p_invoice_date: input.invoiceDate,
          p_due_date: input.dueDate,
          p_currency: (input.currency ?? "NGN").toUpperCase(),
          p_description: input.description?.trim() || "",
          p_lines: this.toRpcLines(prepared),
        });
      if (!error && data) {
        const id = data as string;
        await this.audit(actor, input.companyId, "finance.invoice.created", id, {
          reference,
          total_amount: total,
        });
        return this.getDetail(actor, id);
      }
      if (error?.message.toLowerCase().includes("unique") || error?.code === "23505") {
        reference = this.generateReference();
        continue;
      }
      throw new ActionError("INTERNAL_ERROR", error?.message ?? "Unable to create invoice.");
    }
    throw new ActionError("INTERNAL_ERROR", "Unable to allocate invoice reference.");
  }

  async updateDraft(
    actor: Actor,
    invoiceId: string,
    input: {
      counterpartyId?: string;
      invoiceDate?: string;
      dueDate?: string;
      currency?: string;
      description?: string | null;
      lines?: InvoiceLineInput[];
    }
  ): Promise<FinanceInvoiceDetail> {
    await this.assertCreate(actor);
    const invoice = await this.loadInvoice(invoiceId);
    if (invoice.status !== "draft") {
      throw new ActionError("VALIDATION_ERROR", "Only draft invoices can be edited.");
    }
    await this.assertCompanyAccess(actor, invoice.companyId);

    const counterpartyId = input.counterpartyId ?? invoice.counterpartyId;
    await this.assertCustomerCounterparty(counterpartyId, { requireActive: true });
    const invoiceDate = input.invoiceDate ?? invoice.invoiceDate;
    const dueDate = input.dueDate ?? invoice.dueDate;
    this.assertDates(invoiceDate, dueDate);

    const admin = createAdminClient();
    if (input.lines !== undefined && !input.lines.length) {
      throw new ActionError("VALIDATION_ERROR", "At least one line is required.");
    }
    const prepared = input.lines === undefined ? null : await this.prepareLines(input.lines);
    const { error } = await admin.rpc("finance_invoice_update_draft", {
      p_actor_profile_id: actor.profileId,
      p_invoice_id: invoiceId,
      p_counterparty_id: counterpartyId,
      p_invoice_date: invoiceDate,
      p_due_date: dueDate,
      p_currency: input.currency ? input.currency.toUpperCase() : invoice.currency,
      p_description:
        input.description !== undefined
          ? input.description?.trim() || ""
          : invoice.description ?? "",
      p_lines: prepared ? this.toRpcLines(prepared) : null,
    });
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return this.getDetail(actor, invoiceId);
  }

  async submitForReview(actor: Actor, invoiceId: string): Promise<FinanceInvoiceDetail> {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.create && !caps.review) {
      throw new ActionError("FORBIDDEN", "Missing submit authority.");
    }
    const invoice = await this.loadInvoice(invoiceId);
    await this.assertCompanyAccess(actor, invoice.companyId);
    const { error } = await createAdminClient().rpc("finance_invoice_submit_for_review", {
      p_actor_profile_id: actor.profileId,
      p_invoice_id: invoiceId,
    });
    if (error) throw new ActionError("VALIDATION_ERROR", error.message);
    return this.getDetail(actor, invoiceId);
  }

  async returnToDraft(actor: Actor, invoiceId: string): Promise<FinanceInvoiceDetail> {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.create && !caps.review) {
      throw new ActionError("FORBIDDEN", "Missing return-to-draft authority.");
    }
    const invoice = await this.loadInvoice(invoiceId);
    await this.assertCompanyAccess(actor, invoice.companyId);
    const { error } = await createAdminClient().rpc("finance_invoice_return_to_draft", {
      p_actor_profile_id: actor.profileId,
      p_invoice_id: invoiceId,
    });
    if (error) throw new ActionError("VALIDATION_ERROR", error.message);
    return this.getDetail(actor, invoiceId);
  }

  async deleteDraft(actor: Actor, invoiceId: string): Promise<{ deletedInvoiceId: string }> {
    await this.assertCreate(actor);
    const invoice = await this.loadInvoice(invoiceId);
    await this.assertCompanyAccess(actor, invoice.companyId);
    if (invoice.status !== "draft") {
      throw new ActionError("VALIDATION_ERROR", "Only draft invoices can be deleted.");
    }
    const { error } = await createAdminClient().rpc("finance_invoice_delete_draft", {
      p_actor_profile_id: actor.profileId,
      p_invoice_id: invoiceId,
    });
    if (error) throw new ActionError("VALIDATION_ERROR", error.message);
    return { deletedInvoiceId: invoiceId };
  }

  async getAccountingPreview(actor: Actor, invoiceId: string): Promise<InvoiceAccountingPreview> {
    await this.assertAnyInvoiceCap(actor);
    const detail = await this.getDetail(actor, invoiceId);
    if (!detail.lines.length) {
      throw new ActionError("VALIDATION_ERROR", "Invoice has no lines.");
    }
    const ar = await this.loadArControl();
    const period = await this.accounting.findOpenPeriodForDate(detail.companyId, detail.invoiceDate);

    const credits = new Map<string, { account: FinanceAccount; amount: number }>();
    for (const line of detail.lines) {
      const account = await this.repo.getAccount(line.revenueGlAccountId);
      if (!account || !isRevenueGlEligible(account, this.organisationId)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Revenue GL is unavailable for line ${line.lineNo}.`
        );
      }
      const prev = credits.get(account.id);
      credits.set(account.id, {
        account,
        amount: roundMoney2((prev?.amount ?? 0) + line.lineAmount),
      });
    }

    const previewLines: InvoiceAccountingPreviewLine[] = [
      {
        accountId: ar.id,
        accountCode: ar.code,
        accountName: ar.name,
        debit: detail.totalAmount,
        credit: 0,
        description: `Invoice ${detail.reference} — Trade AR`,
      },
      ...[...credits.values()]
        .sort((a, b) => a.account.code.localeCompare(b.account.code))
        .map(({ account, amount }) => ({
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debit: 0,
          credit: amount,
          description: `Invoice ${detail.reference} — ${account.code}`,
        })),
    ];

    return {
      invoiceId: detail.id,
      status: detail.status,
      totalAmount: detail.totalAmount,
      currency: detail.currency,
      invoiceDate: detail.invoiceDate,
      arAccount: ar,
      lines: previewLines,
      periodId: period?.id ?? null,
      periodLabel: period
        ? `${period.year}-${String(period.month).padStart(2, "0")}`
        : null,
    };
  }

  async issueAndPost(actor: Actor, invoiceId: string): Promise<FinanceInvoiceDetail> {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.issue) throw new ActionError("FORBIDDEN", "Missing issue authority.");
    const postCaps = await this.accounting.getMyAccountingCapabilities(actor.profileId);
    if (!postCaps.post) throw new ActionError("FORBIDDEN", "Missing post authority.");
    const invoice = await this.loadInvoice(invoiceId);
    await this.assertCompanyAccess(actor, invoice.companyId);
    // Fail closed preview validation before RPC
    await this.getAccountingPreview(actor, invoiceId);
    const { error } = await createAdminClient().rpc("finance_invoice_issue_and_post", {
      p_actor_profile_id: actor.profileId,
      p_invoice_id: invoiceId,
    });
    if (error) throw new ActionError("VALIDATION_ERROR", error.message);
    return this.getDetail(actor, invoiceId);
  }

  private async prepareLines(lines: InvoiceLineInput[]) {
    const prepared: Array<{
      lineNo: number;
      description: string;
      quantity: number;
      unitPrice: number;
      lineAmount: number;
      revenueGlAccountId: string;
    }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const description = line.description.trim();
      if (!description) throw new ActionError("VALIDATION_ERROR", `Line ${i + 1}: description required.`);
      if (!(line.quantity > 0)) throw new ActionError("VALIDATION_ERROR", `Line ${i + 1}: quantity must be > 0.`);
      if (!(line.unitPrice >= 0)) {
        throw new ActionError("VALIDATION_ERROR", `Line ${i + 1}: unit price must be >= 0.`);
      }
      const unitPrice = roundMoney2(line.unitPrice);
      const lineAmount = computeInvoiceLineAmount(line.quantity, unitPrice);
      if (!(lineAmount > 0)) {
        throw new ActionError("VALIDATION_ERROR", `Line ${i + 1}: line amount must be > 0.`);
      }
      const account = await this.repo.getAccount(line.revenueGlAccountId);
      if (!account || !isRevenueGlEligible(account, this.organisationId)) {
        throw new ActionError("VALIDATION_ERROR", `Line ${i + 1}: revenue GL is unavailable.`);
      }
      prepared.push({
        lineNo: i + 1,
        description,
        quantity: line.quantity,
        unitPrice,
        lineAmount,
        revenueGlAccountId: account.id,
      });
    }
    return prepared;
  }

  private toRpcLines(
    lines: Array<{
      lineNo: number;
      description: string;
      quantity: number;
      unitPrice: number;
      lineAmount: number;
      revenueGlAccountId: string;
    }>
  ) {
    return lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_amount: line.lineAmount,
      revenue_gl_account_id: line.revenueGlAccountId,
    }));
  }

  private async loadArControl(): Promise<FinanceAccount> {
    const accounts = await this.repo.listAccounts();
    const ar = accounts.find(
      (a) =>
        a.code === "1070" &&
        a.accountType === "asset" &&
        a.classification === "current_asset" &&
        a.status === "active" &&
        a.organisationId === this.organisationId
    );
    if (!ar) throw new ActionError("VALIDATION_ERROR", "Trade AR (1070) is unavailable.");
    return ar;
  }

  private async assertCustomerCounterparty(
    counterpartyId: string,
    opts: { requireActive: boolean }
  ) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organisation_counterparties")
      .select("id,organisation_id,status")
      .eq("id", counterpartyId)
      .eq("organisation_id", this.organisationId)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    if (!data) throw new ActionError("VALIDATION_ERROR", "Counterparty not found.");
    if (opts.requireActive && data.status !== "active") {
      throw new ActionError("VALIDATION_ERROR", "Counterparty is inactive.");
    }
    const { data: role } = await admin
      .from("organisation_counterparty_roles")
      .select("id")
      .eq("counterparty_id", counterpartyId)
      .eq("role", "customer")
      .maybeSingle();
    if (!role) throw new ActionError("VALIDATION_ERROR", "Counterparty is not a customer.");
  }

  private assertDates(invoiceDate: string, dueDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw new ActionError("VALIDATION_ERROR", "Invoice and due dates must be YYYY-MM-DD.");
    }
    if (dueDate < invoiceDate) {
      throw new ActionError("VALIDATION_ERROR", "Due date must be on or after invoice date.");
    }
  }

  private async loadInvoice(invoiceId: string): Promise<FinanceInvoice> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_invoices")
      .select(
        "id,organisation_id,company_id,reference,counterparty_id,invoice_date,due_date,currency,description,status,total_amount,counterparty_display_name,counterparty_legal_name,counterparty_tax_registration_id,finance_transaction_id,created_by_profile_id,reviewed_by_profile_id,issued_by_profile_id,reviewed_at,issued_at,created_at,updated_at"
      )
      .eq("organisation_id", this.organisationId)
      .eq("id", invoiceId)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    if (!data) throw new ActionError("VALIDATION_ERROR", "Invoice not found.");
    return this.mapInvoice(data);
  }

  private mapInvoice(row: Record<string, unknown>): FinanceInvoice {
    return {
      id: row.id as string,
      organisationId: row.organisation_id as string,
      companyId: row.company_id as string,
      reference: row.reference as string,
      counterpartyId: row.counterparty_id as string,
      invoiceDate: row.invoice_date as string,
      dueDate: row.due_date as string,
      currency: row.currency as string,
      description: (row.description as string | null) ?? null,
      status: row.status as InvoiceStatus,
      totalAmount: Number(row.total_amount),
      counterpartyDisplayName: (row.counterparty_display_name as string | null) ?? null,
      counterpartyLegalName: (row.counterparty_legal_name as string | null) ?? null,
      counterpartyTaxRegistrationId:
        (row.counterparty_tax_registration_id as string | null) ?? null,
      financeTransactionId: (row.finance_transaction_id as string | null) ?? null,
      createdByProfileId: row.created_by_profile_id as string,
      reviewedByProfileId: (row.reviewed_by_profile_id as string | null) ?? null,
      issuedByProfileId: (row.issued_by_profile_id as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      issuedAt: (row.issued_at as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private async loadCaps(profileId: string): Promise<Set<string>> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .in("capability", [
        "platform_finance.invoice.view",
        "platform_finance.invoice.create",
        "platform_finance.invoice.review",
        "platform_finance.invoice.issue",
      ]);
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return new Set((data ?? []).map((r) => r.capability as string));
  }

  private async assertAnyInvoiceCap(actor: Actor) {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.view) throw new ActionError("FORBIDDEN", "Missing invoice view authority.");
  }

  private async assertCreate(actor: Actor) {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.create) throw new ActionError("FORBIDDEN", "Missing invoice create authority.");
  }

  private async assertCompanyAccess(actor: Actor, companyId: string) {
    const ids = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!ids.includes(companyId)) throw new ActionError("FORBIDDEN", "No company access.");
  }

  private generateReference(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    return `INV-${day}-${suffix}`;
  }

  private async audit(
    actor: Actor,
    companyId: string,
    action: string,
    objectId: string,
    details?: Record<string, unknown>
  ) {
    await createAdminClient().from("finance_audit_events").insert({
      organisation_id: this.organisationId,
      company_id: companyId,
      actor_profile_id: actor.profileId,
      action,
      object_type: "finance_invoice",
      object_id: objectId,
      details: details ?? {},
    });
  }
}
