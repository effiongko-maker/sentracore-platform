import { ActionError } from "@/lib/actions/errors";
import {
  AP_CONTROL_CODE,
  isSupplierBillDebitEligible,
  journalSourceDescriptor,
  periodBlockingReason,
  SUPPLIER_BILL_NO_INVOICE_DATE_REASON,
  SUPPLIER_BILL_NO_OBLIGATION_REASON,
  SUPPLIER_BILL_PERIOD_CLOSED_REASON,
  SUPPLIER_BILL_PERIOD_MISSING_REASON,
  type AccountingReviewWorkItem,
  type SupplierBillAccountingReview,
} from "@/modules/platform-finance/domain/accountingReview";
import type { FinanceAccount } from "@/modules/platform-finance/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { PlatformFinancePaymentAccountingServerService } from "./PlatformFinancePaymentAccountingServerService";
import { PlatformFinanceRepository } from "./PlatformFinanceRepository";
import { PlatformFinanceServerService } from "./PlatformFinanceServerService";

type Actor = { organisationId: string; profileId: string };

/**
 * Review & Post across source events. Extends the existing Payment Review & Post pattern (draft
 * finance_transactions + the canonical posting engine) to supplier-bill recognition; payments are delegated to the
 * existing payment accounting service. Nothing here writes an operational record (vendor bill, payable, payment).
 */
export class PlatformFinanceAccountingReviewServerService {
  private readonly repo: PlatformFinanceRepository;
  private readonly accounting: PlatformFinanceServerService;
  private readonly payments: PlatformFinancePaymentAccountingServerService;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
    this.accounting = new PlatformFinanceServerService(organisationId);
    this.payments = new PlatformFinancePaymentAccountingServerService(organisationId);
  }

  /** One work list: every supported source event whose accounting is not yet posted. */
  async listWork(actor: Actor): Promise<AccountingReviewWorkItem[]> {
    const caps = await this.accounting.getMyAccountingCapabilities(actor.profileId);
    if (!caps.view && !caps.createTransaction && !caps.post) throw new ActionError("FORBIDDEN", "Missing accounting authority.");
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!companyIds.length) return [];
    const accounts = await this.repo.listAccounts();
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const ap = accounts.find((a) => a.code === AP_CONTROL_CODE && a.status === "active") ?? null;
    const brief = (a: FinanceAccount | null | undefined) => (a ? { id: a.id, code: a.code, name: a.name } : null);

    const [supplierBills, paymentWork] = await Promise.all([
      this.listSupplierBillWork(companyIds, accountById, ap),
      this.payments.listWork(actor),
    ]);

    const paymentItems: AccountingReviewWorkItem[] = paymentWork
      .filter((p) => p.accountingStatus !== "posted")
      .map((p) => {
        const source = journalSourceDescriptor({ sourceType: "payment", sourceId: p.paymentId, payableId: p.payableId });
        return {
          sourceType: "payment",
          sourceId: p.paymentId,
          sourceLabel: p.treatment === "accrued_settlement" ? "Supplier payment · settles recognised bill" : "Payment · Financial Request",
          sourceHref: source.href ?? `/platform-finance/payables/${p.payableId}`,
          counterparty: p.payeeName,
          reference: `PAY-${p.paymentId.slice(0, 8).toUpperCase()}`,
          accountingDate: p.paymentDate,
          amount: p.amount,
          currency: p.currency,
          companyId: p.companyId,
          proposedDebit: p.treatment === "accrued_settlement"
            ? { side: "debit", account: brief(ap), determinedBy: "system" }
            : { side: "debit", account: null, determinedBy: "reviewer" },
          proposedCredit: { side: "credit", account: brief(p.sourceControlAccountId ? accountById.get(p.sourceControlAccountId) : null), determinedBy: "system" },
          status: p.accountingStatus,
          blockingReason: p.blockingReason,
          transactionId: p.transactionId,
          journalEntryId: p.journalEntryId,
        };
      });

    return [...supplierBills, ...paymentItems].sort((a, b) => (a.accountingDate < b.accountingDate ? 1 : a.accountingDate > b.accountingDate ? -1 : 0));
  }

  private async listSupplierBillWork(
    companyIds: string[],
    accountById: Map<string, FinanceAccount>,
    ap: FinanceAccount | null
  ): Promise<AccountingReviewWorkItem[]> {
    const admin = createAdminClient();
    const { data: bills, error } = await admin.from("finance_vendor_bills")
      .select("id,company_id,payee_name,invoice_reference,invoice_date,approved_amount,currency,status,decided_at")
      .eq("organisation_id", this.organisationId).in("status", ["approved", "partially_approved"]).in("company_id", companyIds);
    if (error) throw new ActionError("INTERNAL_ERROR", "Unable to load supplier bill accounting work.");
    const billIds = (bills ?? []).map((b) => b.id as string);
    if (!billIds.length) return [];
    const [{ data: payables, error: payableError }, { data: fts, error: ftError }, { data: periods, error: periodError }] = await Promise.all([
      admin.from("finance_payables").select("id,source_id,status,payable_amount").eq("organisation_id", this.organisationId).eq("source_type", "vendor_bill").in("source_id", billIds),
      admin.from("finance_transactions").select("id,source_id,status,journal_entry_id,metadata").eq("organisation_id", this.organisationId).eq("source_type", "vendor_bill").in("source_id", billIds),
      admin.from("finance_periods").select("company_id,start_date,end_date,status").eq("organisation_id", this.organisationId).in("company_id", companyIds),
    ]);
    if (payableError || ftError || periodError) throw new ActionError("INTERNAL_ERROR", "Unable to load supplier bill accounting work.");
    const payableByBill = new Map((payables ?? []).map((p) => [p.source_id as string, p]));
    const ftByBill = new Map((fts ?? []).map((f) => [f.source_id as string, f]));
    const periodRows = (periods ?? []).map((p) => ({ companyId: p.company_id as string, startDate: p.start_date as string, endDate: p.end_date as string, status: p.status as string }));
    const items: AccountingReviewWorkItem[] = [];
    for (const bill of bills ?? []) {
      const ft = ftByBill.get(bill.id as string);
      const posted = ft?.status === "posted" && Boolean(ft.journal_entry_id);
      if (posted) continue;
      const payable = payableByBill.get(bill.id as string);
      const invoiceDate = (bill.invoice_date as string | null) ?? null;
      const blockingReason = !payable
        ? SUPPLIER_BILL_NO_OBLIGATION_REASON
        : !invoiceDate
          ? SUPPLIER_BILL_NO_INVOICE_DATE_REASON
          : periodBlockingReason(periodRows, bill.company_id as string, invoiceDate, {
              missing: SUPPLIER_BILL_PERIOD_MISSING_REASON,
              closed: SUPPLIER_BILL_PERIOD_CLOSED_REASON,
            });
      const debitId = ft && typeof (ft.metadata as Record<string, unknown> | null)?.debit_account_id === "string"
        ? ((ft.metadata as Record<string, unknown>).debit_account_id as string)
        : null;
      const debit = debitId ? accountById.get(debitId) : undefined;
      items.push({
        sourceType: "vendor_bill",
        sourceId: bill.id as string,
        sourceLabel: "Supplier bill",
        sourceHref: `/platform-finance/vendor-bills/${bill.id as string}`,
        counterparty: bill.payee_name as string,
        reference: (bill.invoice_reference as string | null) ?? null,
        accountingDate: invoiceDate ?? String(bill.decided_at ?? "").slice(0, 10),
        amount: Number(payable?.payable_amount ?? bill.approved_amount),
        currency: bill.currency as string,
        companyId: bill.company_id as string,
        proposedDebit: { side: "debit", account: debit ? { id: debit.id, code: debit.code, name: debit.name } : null, determinedBy: "reviewer" },
        proposedCredit: { side: "credit", account: ap ? { id: ap.id, code: ap.code, name: ap.name } : null, determinedBy: "system" },
        status: ft ? "draft" : "pending",
        blockingReason,
        transactionId: (ft?.id as string | undefined) ?? null,
        journalEntryId: null,
      });
    }
    return items;
  }

  /** `startReview` creates the draft accounting transaction (Review & Post); false is a pure read (status display). */
  async getSupplierBillReview(actor: Actor, vendorBillId: string, options: { startReview?: boolean } = {}): Promise<SupplierBillAccountingReview> {
    const startReview = options.startReview !== false;
    const caps = await this.accounting.getMyAccountingCapabilities(actor.profileId);
    if (!caps.view && !caps.createTransaction && !caps.post) throw new ActionError("FORBIDDEN", "Missing accounting authority.");
    const admin = createAdminClient();
    const { data: bill, error } = await admin.from("finance_vendor_bills")
      .select("id,company_id,status,currency,billed_amount,approved_amount,payee_name,payee_type,invoice_reference,invoice_date,description,purpose,goods_services_received,project_contract_ref")
      .eq("organisation_id", this.organisationId).eq("id", vendorBillId).maybeSingle();
    if (error || !bill) throw new ActionError("VALIDATION_ERROR", "Vendor bill not found.");
    const accessible = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!accessible.includes(bill.company_id as string)) throw new ActionError("FORBIDDEN", "No company access.");
    if (!["approved", "partially_approved"].includes(bill.status as string)) {
      throw new ActionError("VALIDATION_ERROR", "Only a decided (approved) vendor bill establishes a supplier obligation to recognise.");
    }
    const { data: payable } = await admin.from("finance_payables").select("id,status,payable_amount,paid_amount")
      .eq("organisation_id", this.organisationId).eq("source_type", "vendor_bill").eq("source_id", vendorBillId).maybeSingle();

    let ftRow = await this.findSupplierTransaction(vendorBillId);
    const recognisable = Boolean(payable) && Boolean(bill.invoice_date);
    if (!ftRow && recognisable && caps.createTransaction && startReview) {
      const { error: createError } = await admin.rpc("finance_vendor_bill_accounting_get_or_create", {
        p_actor_profile_id: actor.profileId, p_vendor_bill_id: vendorBillId,
      });
      if (createError) throw new ActionError("VALIDATION_ERROR", createError.message || "Unable to start supplier bill accounting review.");
      ftRow = await this.findSupplierTransaction(vendorBillId);
    }

    const accounts = await this.repo.listAccounts();
    const ap = accounts.find((a) => a.code === AP_CONTROL_CODE && a.status === "active") ?? null;
    const { data: controls } = await admin.from("finance_financial_accounts").select("control_gl_account_id").eq("organisation_id", this.organisationId);
    const controlIds = new Set((controls ?? []).map((c) => c.control_gl_account_id as string));
    const eligibleDebitAccounts = accounts
      .filter((a) => isSupplierBillDebitEligible(a, controlIds, a.id))
      .map((a) => ({ id: a.id, code: a.code, name: a.name, accountType: a.accountType, classification: a.classification ?? null }));
    const debitId = ftRow && typeof ftRow.metadata?.debit_account_id === "string" ? ftRow.metadata.debit_account_id : null;
    const debit = debitId ? accounts.find((a) => a.id === debitId) ?? null : null;
    const invoiceDate = (bill.invoice_date as string | null) ?? null;
    const period = invoiceDate ? await this.accounting.findOpenPeriodForDate(bill.company_id as string, invoiceDate) : null;
    const posted = ftRow?.status === "posted" && Boolean(ftRow.journal_entry_id);
    let blockingReason: string | null = null;
    if (!posted) {
      if (!payable) blockingReason = SUPPLIER_BILL_NO_OBLIGATION_REASON;
      else if (!invoiceDate) blockingReason = SUPPLIER_BILL_NO_INVOICE_DATE_REASON;
      else if (!period) {
        blockingReason = periodBlockingReason(await this.repo.listPeriods(bill.company_id as string), bill.company_id as string, invoiceDate, {
          missing: SUPPLIER_BILL_PERIOD_MISSING_REASON,
          closed: SUPPLIER_BILL_PERIOD_CLOSED_REASON,
        });
      }
    }
    const company = await this.repo.getCompany(bill.company_id as string);
    return {
      status: posted ? "posted" : ftRow ? "draft" : "pending",
      vendorBill: {
        id: bill.id as string,
        payeeName: bill.payee_name as string,
        payeeType: bill.payee_type as string,
        invoiceReference: (bill.invoice_reference as string | null) ?? null,
        invoiceDate,
        purpose: bill.purpose as string,
        description: (bill.description as string | null) ?? null,
        projectContractRef: (bill.project_contract_ref as string | null) ?? null,
        goodsServicesReceived: Boolean(bill.goods_services_received),
        billedAmount: Number(bill.billed_amount),
        approvedAmount: Number(bill.approved_amount),
        status: bill.status as string,
      },
      payable: payable
        ? { id: payable.id as string, status: payable.status as string, payableAmount: Number(payable.payable_amount), paidAmount: Number(payable.paid_amount) }
        : { id: "", status: "missing", payableAmount: 0, paidAmount: 0 },
      companyName: company?.name ?? "Company",
      currency: bill.currency as string,
      amount: Number(payable?.payable_amount ?? bill.approved_amount),
      transactionId: ftRow?.id ?? null,
      debitAccount: debit,
      creditAccount: ap,
      eligibleDebitAccounts,
      period: period ? { id: period.id, year: period.year, month: period.month } : null,
      blockingReason,
      journalEntryId: posted ? (ftRow?.journal_entry_id ?? null) : null,
    };
  }

  /** Dr reviewer-confirmed classification / Cr 2000 — lines built and posted by the database via the canonical engine. */
  async postSupplierBill(actor: Actor, vendorBillId: string, debitAccountId: string): Promise<SupplierBillAccountingReview> {
    const caps = await this.accounting.getMyAccountingCapabilities(actor.profileId);
    if (!caps.post || !caps.createTransaction) throw new ActionError("FORBIDDEN", "Missing accounting post authority.");
    const review = await this.getSupplierBillReview(actor, vendorBillId);
    if (review.status === "posted") return review;
    if (review.blockingReason) throw new ActionError("VALIDATION_ERROR", review.blockingReason);
    if (!review.transactionId) throw new ActionError("VALIDATION_ERROR", "Supplier bill accounting review has not started.");
    const admin = createAdminClient();
    const setDebit = await admin.rpc("finance_vendor_bill_accounting_set_debit", {
      p_actor_profile_id: actor.profileId, p_transaction_id: review.transactionId, p_debit_account_id: debitAccountId,
    });
    if (setDebit.error) throw new ActionError("VALIDATION_ERROR", setDebit.error.message || "Debit classification was not accepted.");
    const posted = await admin.rpc("finance_vendor_bill_accounting_post", {
      p_actor_profile_id: actor.profileId, p_vendor_bill_id: vendorBillId,
    });
    if (posted.error) {
      // Concurrent/repeated posting converges on the one journal created for this source.
      const latest = await this.getSupplierBillReview(actor, vendorBillId);
      if (latest.status === "posted") return latest;
      throw new ActionError("VALIDATION_ERROR", posted.error.message || "Unable to post supplier bill accounting.");
    }
    return this.getSupplierBillReview(actor, vendorBillId);
  }

  private async findSupplierTransaction(vendorBillId: string): Promise<{ id: string; status: string; journal_entry_id: string | null; metadata: Record<string, unknown> | null } | null> {
    const { data } = await createAdminClient().from("finance_transactions").select("id,status,journal_entry_id,metadata")
      .eq("organisation_id", this.organisationId).eq("source_type", "vendor_bill").eq("source_id", vendorBillId).maybeSingle();
    return (data as { id: string; status: string; journal_entry_id: string | null; metadata: Record<string, unknown> | null } | null) ?? null;
  }
}
