import { createAdminClient } from "@/utils/supabase/admin";
import type {
  FinancialRequest,
  FinancialRequestDocument,
  FinancialRequestEvent,
  FinancialRequestPayeeType,
  FinancialRequestStatus,
} from "@/modules/platform-finance/domain/requests";

function db() {
  return createAdminClient();
}

function throwDb(
  error: { message?: string } | null,
  fallback: string
): never {
  throw new Error(error?.message?.trim() || fallback);
}

type RequestRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  requester_profile_id: string;
  status: string;
  currency: string;
  requested_amount: number | string;
  approved_amount: number | string;
  paid_amount: number | string;
  category_id: string;
  purpose: string;
  description: string | null;
  payee_name: string;
  payee_type: string;
  required_by_date: string | null;
  external_reference: string | null;
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
  request_id: string;
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
  request_id: string;
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

export function mapFinancialRequest(row: RequestRow): FinancialRequest {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    requesterProfileId: row.requester_profile_id,
    status: row.status as FinancialRequestStatus,
    currency: row.currency,
    requestedAmount: Number(row.requested_amount),
    approvedAmount: Number(row.approved_amount),
    paidAmount: Number(row.paid_amount),
    categoryId: row.category_id,
    purpose: row.purpose,
    description: row.description,
    payeeName: row.payee_name,
    payeeType: row.payee_type as FinancialRequestPayeeType,
    requiredByDate: row.required_by_date,
    externalReference: row.external_reference,
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

function mapEvent(row: EventRow): FinancialRequestEvent {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    requestId: row.request_id,
    actorProfileId: row.actor_profile_id,
    eventType: row.event_type as FinancialRequestEvent["eventType"],
    fromStatus: (row.from_status as FinancialRequestStatus | null) ?? null,
    toStatus: (row.to_status as FinancialRequestStatus | null) ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function mapDocument(row: DocumentRow): FinancialRequestDocument {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    requestId: row.request_id,
    uploadedByProfileId: row.uploaded_by_profile_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    checksum: row.checksum,
    documentRole: row.document_role as FinancialRequestDocument["documentRole"],
    uploadedAt: row.uploaded_at,
    supersededAt: row.superseded_at,
    supersededByDocumentId: row.superseded_by_document_id,
  };
}

const REQUEST_SELECT = "*";

export class PlatformFinanceRequestsRepository {
  constructor(private readonly organisationId: string) {}

  async getRequest(requestId: string): Promise<FinancialRequest | null> {
    const { data, error } = await db()
      .from("finance_requests")
      .select(REQUEST_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("id", requestId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load financial request.");
    return data ? mapFinancialRequest(data as RequestRow) : null;
  }

  async listMyRequests(
    requesterProfileId: string
  ): Promise<FinancialRequest[]> {
    const { data, error } = await db()
      .from("finance_requests")
      .select(REQUEST_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("requester_profile_id", requesterProfileId)
      .order("created_at", { ascending: false });
    if (error) throwDb(error, "Failed to list my financial requests.");
    return (data ?? []).map((row) => mapFinancialRequest(row as RequestRow));
  }

  async listReviewQueue(
    accessibleCompanyIds: string[]
  ): Promise<FinancialRequest[]> {
    if (accessibleCompanyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_requests")
      .select(REQUEST_SELECT)
      .eq("organisation_id", this.organisationId)
      .in("company_id", accessibleCompanyIds)
      .in("status", ["submitted", "under_review", "resubmitted"])
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Failed to list review queue.");
    return (data ?? []).map((row) => mapFinancialRequest(row as RequestRow));
  }

  async listApprovalQueue(
    accessibleCompanyIds: string[]
  ): Promise<FinancialRequest[]> {
    if (accessibleCompanyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_requests")
      .select(REQUEST_SELECT)
      .eq("organisation_id", this.organisationId)
      .in("company_id", accessibleCompanyIds)
      .eq("status", "pending_ceo_approval")
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Failed to list approval queue.");
    return (data ?? []).map((row) => mapFinancialRequest(row as RequestRow));
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

  async listRequestEvents(
    requestId: string
  ): Promise<FinancialRequestEvent[]> {
    const { data, error } = await db()
      .from("finance_request_events")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Failed to list request events.");
    return (data ?? []).map((row) => mapEvent(row as EventRow));
  }

  async listRequestDocuments(
    requestId: string
  ): Promise<FinancialRequestDocument[]> {
    const { data, error } = await db()
      .from("finance_request_documents")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("request_id", requestId)
      .order("uploaded_at", { ascending: true });
    if (error) throwDb(error, "Failed to list request documents.");
    return (data ?? []).map((row) => mapDocument(row as DocumentRow));
  }

  /**
   * Slice 2 test/helper only: insert document metadata (no Storage upload).
   * Production upload lands in a later slice.
   */
  async insertDocumentMetadata(input: {
    requestId: string;
    uploadedByProfileId: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    storageBucket: string;
    storagePath: string;
    documentRole: FinancialRequestDocument["documentRole"];
    checksum?: string | null;
  }): Promise<FinancialRequestDocument> {
    const { data, error } = await db()
      .from("finance_request_documents")
      .insert({
        organisation_id: this.organisationId,
        request_id: input.requestId,
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
      throwDb(error, "Failed to insert document metadata.");
    }
    return mapDocument(data as DocumentRow);
  }

  async listRequestsForCompanies(
    companyIds: string[]
  ): Promise<FinancialRequest[]> {
    if (companyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_requests")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .in("company_id", companyIds)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throwDb(error, "Failed to list financial requests.");
    return (data ?? []).map((row) => mapFinancialRequest(row as RequestRow));
  }

  async listRecentRequestEvents(limit = 12): Promise<FinancialRequestEvent[]> {
    const { data, error } = await db()
      .from("finance_request_events")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwDb(error, "Failed to list request events.");
    return (data ?? []).map((row) => mapEvent(row as EventRow));
  }
}
