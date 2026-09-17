/**
 * Platform Finance Vendor Bills — org-scoped read repository + document metadata.
 * Lifecycle mutations go through named RPCs in vendorBillTransitions.ts.
 */
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  FinanceVendorBill,
  FinanceVendorBillDocument,
  FinanceVendorBillDocumentRole,
  FinanceVendorBillEvent,
  FinanceVendorBillPayableSummary,
  FinanceVendorBillPayeeType,
  FinanceVendorBillStatus,
} from "@/modules/platform-finance/domain/vendorBills";
import { maskedPaymentDestinationFromRow } from "@/modules/platform-finance/domain/paymentDestination";

function db() {
  return createAdminClient();
}

function throwDb(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message?.trim() || fallback);
}

type VendorBillRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  inputter_profile_id: string;
  status: string;
  currency: string;
  billed_amount: number | string;
  approved_amount: number | string;
  payee_name: string;
  payee_type: string;
  payment_method: string | null;
  payment_bank_name: string | null;
  payment_account_name: string | null;
  payment_account_number_last4: string | null;
  invoice_reference: string | null;
  invoice_date: string | null;
  description: string | null;
  purpose: string;
  goods_services_received: boolean;
  due_date: string | null;
  project_contract_ref: string | null;
  finance_notes: string | null;
  ceo_decision_notes: string | null;
  queried_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  organisation_id: string;
  vendor_bill_id: string;
  actor_profile_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DocumentRow = {
  id: string;
  organisation_id: string;
  vendor_bill_id: string;
  uploaded_by_profile_id: string;
  filename: string;
  mime_type: string;
  byte_size: number | string;
  storage_bucket: string;
  storage_path: string;
  checksum: string | null;
  document_role: string;
  uploaded_at: string;
  superseded_at: string | null;
  superseded_by_document_id: string | null;
};

export function mapFinanceVendorBill(row: VendorBillRow): FinanceVendorBill {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    inputterProfileId: row.inputter_profile_id,
    status: row.status as FinanceVendorBillStatus,
    currency: row.currency,
    billedAmount: Number(row.billed_amount),
    approvedAmount: Number(row.approved_amount),
    payeeName: row.payee_name,
    payeeType: row.payee_type as FinanceVendorBillPayeeType,
    paymentDestination: maskedPaymentDestinationFromRow(row),
    invoiceReference: row.invoice_reference,
    invoiceDate: row.invoice_date,
    description: row.description,
    purpose: row.purpose,
    goodsServicesReceived: Boolean(row.goods_services_received),
    dueDate: row.due_date,
    projectContractRef: row.project_contract_ref,
    financeNotes: row.finance_notes,
    ceoDecisionNotes: row.ceo_decision_notes,
    queriedAt: row.queried_at,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: EventRow): FinanceVendorBillEvent {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    vendorBillId: row.vendor_bill_id,
    actorProfileId: row.actor_profile_id,
    eventType: row.event_type as FinanceVendorBillEvent["eventType"],
    fromStatus: (row.from_status as FinanceVendorBillStatus | null) ?? null,
    toStatus: (row.to_status as FinanceVendorBillStatus | null) ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function mapDocument(row: DocumentRow): FinanceVendorBillDocument {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    vendorBillId: row.vendor_bill_id,
    uploadedByProfileId: row.uploaded_by_profile_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    checksum: row.checksum,
    documentRole: row.document_role as FinanceVendorBillDocumentRole,
    uploadedAt: row.uploaded_at,
    supersededAt: row.superseded_at,
    supersededByDocumentId: row.superseded_by_document_id,
  };
}

// Explicit safe projection: cryptographic columns must never enter ordinary DTOs.
const VENDOR_BILL_SELECT = [
  "id", "organisation_id", "company_id", "inputter_profile_id", "status",
  "currency", "billed_amount", "approved_amount", "payee_name", "payee_type",
  "invoice_reference", "invoice_date", "description", "purpose",
  "goods_services_received", "due_date", "project_contract_ref", "finance_notes",
  "ceo_decision_notes", "queried_at", "submitted_at", "reviewed_at", "decided_at",
  "created_at", "updated_at", "payment_method", "payment_bank_name",
  "payment_account_name", "payment_account_number_last4",
].join(",");

export class PlatformFinanceVendorBillsRepository {
  constructor(private readonly organisationId: string) {}

  async getVendorBill(vendorBillId: string): Promise<FinanceVendorBill | null> {
    const { data, error } = await db()
      .from("finance_vendor_bills")
      .select(VENDOR_BILL_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("id", vendorBillId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load vendor bill.");
    return data ? mapFinanceVendorBill(data as unknown as VendorBillRow) : null;
  }

  async listMyVendorBills(
    inputterProfileId: string
  ): Promise<FinanceVendorBill[]> {
    const { data, error } = await db()
      .from("finance_vendor_bills")
      .select(VENDOR_BILL_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("inputter_profile_id", inputterProfileId)
      .order("created_at", { ascending: false });
    if (error) throwDb(error, "Failed to list my vendor bills.");
    return (data ?? []).map((row) => mapFinanceVendorBill(row as unknown as VendorBillRow));
  }

  async listVendorBillsForCompanies(
    accessibleCompanyIds: string[]
  ): Promise<FinanceVendorBill[]> {
    if (accessibleCompanyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_vendor_bills")
      .select(VENDOR_BILL_SELECT)
      .eq("organisation_id", this.organisationId)
      .in("company_id", accessibleCompanyIds)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throwDb(error, "Failed to list vendor bills for companies.");
    return (data ?? []).map((row) => mapFinanceVendorBill(row as unknown as VendorBillRow));
  }

  async listReviewQueue(
    accessibleCompanyIds: string[]
  ): Promise<FinanceVendorBill[]> {
    if (accessibleCompanyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_vendor_bills")
      .select(VENDOR_BILL_SELECT)
      .eq("organisation_id", this.organisationId)
      .in("company_id", accessibleCompanyIds)
      .in("status", ["submitted", "under_review", "resubmitted"])
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Failed to list vendor bill review queue.");
    return (data ?? []).map((row) => mapFinanceVendorBill(row as unknown as VendorBillRow));
  }

  async listApprovalQueue(
    accessibleCompanyIds: string[]
  ): Promise<FinanceVendorBill[]> {
    if (accessibleCompanyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_vendor_bills")
      .select(VENDOR_BILL_SELECT)
      .eq("organisation_id", this.organisationId)
      .in("company_id", accessibleCompanyIds)
      .eq("status", "pending_ceo_approval")
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Failed to list vendor bill approval queue.");
    return (data ?? []).map((row) => mapFinanceVendorBill(row as unknown as VendorBillRow));
  }

  async listAccessibleCompanyIds(profileId: string): Promise<string[]> {
    const { data, error } = await db()
      .from("finance_company_access")
      .select("company_id")
      .eq("profile_id", profileId)
      .eq("organisation_id", this.organisationId);
    if (error) throwDb(error, "Failed to list company access.");
    return (data ?? []).map((row) => row.company_id as string);
  }

  async listProfileSummaries(
    profileIds: string[]
  ): Promise<
    Array<{
      id: string;
      fullName: string | null;
      jobTitle: string | null;
    }>
  > {
    const unique = [...new Set(profileIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const { data, error } = await db()
      .from("profiles")
      .select("id, full_name, first_name, last_name, job_title")
      .in("id", unique);
    if (error) throwDb(error, "Failed to list profiles.");
    return (data ?? []).map((row) => {
      const full =
        (row.full_name && String(row.full_name).trim()) ||
        [row.first_name, row.last_name]
          .filter(Boolean)
          .map(String)
          .join(" ")
          .trim() ||
        null;
      return {
        id: String(row.id),
        fullName: full,
        jobTitle: row.job_title ? String(row.job_title) : null,
      };
    });
  }

  async listAccessibleCompanies(
    profileId: string
  ): Promise<Array<{ id: string; code: string; name: string; status: string }>> {
    const companyIds = await this.listAccessibleCompanyIds(profileId);
    if (companyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_companies")
      .select("id, code, name, status")
      .eq("organisation_id", this.organisationId)
      .in("id", companyIds)
      .order("name", { ascending: true });
    if (error) throwDb(error, "Failed to list accessible companies.");
    return (data ?? []).map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      status: String(row.status),
    }));
  }

  async listVendorBillEvents(
    vendorBillId: string
  ): Promise<FinanceVendorBillEvent[]> {
    const { data, error } = await db()
      .from("finance_vendor_bill_events")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("vendor_bill_id", vendorBillId)
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Failed to list vendor bill events.");
    return (data ?? []).map((row) => mapEvent(row as EventRow));
  }

  async listVendorBillDocuments(
    vendorBillId: string
  ): Promise<FinanceVendorBillDocument[]> {
    const { data, error } = await db()
      .from("finance_vendor_bill_documents")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("vendor_bill_id", vendorBillId)
      .order("uploaded_at", { ascending: true });
    if (error) throwDb(error, "Failed to list vendor bill documents.");
    return (data ?? []).map((row) => mapDocument(row as DocumentRow));
  }

  async insertDocumentMetadata(input: {
    id: string;
    vendorBillId: string;
    uploadedByProfileId: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    storageBucket: string;
    storagePath: string;
    documentRole: FinanceVendorBillDocumentRole;
    checksum?: string | null;
  }): Promise<FinanceVendorBillDocument> {
    const { data, error } = await db()
      .from("finance_vendor_bill_documents")
      .insert({
        id: input.id,
        organisation_id: this.organisationId,
        vendor_bill_id: input.vendorBillId,
        uploaded_by_profile_id: input.uploadedByProfileId,
        filename: input.filename,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        storage_bucket: input.storageBucket,
        storage_path: input.storagePath,
        checksum: input.checksum ?? null,
        document_role: input.documentRole,
      })
      .select("*")
      .single();
    if (error || !data) {
      throwDb(error, "Failed to insert vendor bill document metadata.");
    }
    return mapDocument(data as DocumentRow);
  }

  async getDocument(
    documentId: string
  ): Promise<FinanceVendorBillDocument | null> {
    const { data, error } = await db()
      .from("finance_vendor_bill_documents")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load vendor bill document.");
    return data ? mapDocument(data as DocumentRow) : null;
  }

  async deleteDocumentMetadata(documentId: string): Promise<void> {
    const { error } = await db()
      .from("finance_vendor_bill_documents")
      .delete()
      .eq("organisation_id", this.organisationId)
      .eq("id", documentId);
    if (error) {
      throwDb(error, "Failed to delete draft vendor bill document metadata.");
    }
  }

  async markDocumentSuperseded(input: {
    documentId: string;
    supersededByDocumentId: string;
    supersededAt: string;
  }): Promise<FinanceVendorBillDocument> {
    const { data, error } = await db()
      .from("finance_vendor_bill_documents")
      .update({
        superseded_at: input.supersededAt,
        superseded_by_document_id: input.supersededByDocumentId,
      })
      .eq("organisation_id", this.organisationId)
      .eq("id", input.documentId)
      .is("superseded_at", null)
      .select("*")
      .single();
    if (error || !data) {
      throwDb(error, "Failed to supersede vendor bill document.");
    }
    return mapDocument(data as DocumentRow);
  }

  async appendVendorBillEvent(input: {
    vendorBillId: string;
    actorProfileId: string;
    eventType: FinanceVendorBillEvent["eventType"];
    fromStatus?: FinanceVendorBillStatus | null;
    toStatus?: FinanceVendorBillStatus | null;
    metadata?: Record<string, unknown>;
  }): Promise<FinanceVendorBillEvent> {
    const { data, error } = await db()
      .from("finance_vendor_bill_events")
      .insert({
        organisation_id: this.organisationId,
        vendor_bill_id: input.vendorBillId,
        actor_profile_id: input.actorProfileId,
        event_type: input.eventType,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !data) {
      throwDb(error, "Failed to append vendor bill event.");
    }
    return mapEvent(data as EventRow);
  }

  /** Read-only linkage to the Payable minted by CEO approval, if any. */
  async getPayableForVendorBill(
    vendorBillId: string
  ): Promise<FinanceVendorBillPayableSummary | null> {
    const { data, error } = await db()
      .from("finance_payables")
      .select("id, status, payable_amount, paid_amount, currency, due_date, payment_method, payment_bank_name, payment_account_name, payment_account_number_last4")
      .eq("organisation_id", this.organisationId)
      .eq("source_type", "vendor_bill")
      .eq("source_id", vendorBillId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load payable for vendor bill.");
    if (!data) return null;
    return {
      id: String(data.id),
      status: String(data.status),
      payableAmount: Number(data.payable_amount),
      paidAmount: Number(data.paid_amount),
      currency: String(data.currency),
      dueDate: data.due_date ? String(data.due_date) : null,
      paymentDestination: maskedPaymentDestinationFromRow(data),
    };
  }
}
