/**
 * Platform Finance Payables — org-scoped read repository (Slice 3 + Slice 4 documents).
 * Mutations go through named RPCs in payableTransitions.ts (lifecycle)
 * or service-role document helpers (Slice 4).
 */
import { createAdminClient } from "@/utils/supabase/admin";
import {
  toFinancePayableView,
  type FinancePayable,
  type FinancePayableDocument,
  type FinancePayableDocumentRole,
  type FinancePayableEvent,
  type FinancePayablePayeeType,
  type FinancePayableSourceRequestSummary,
  type FinancePayableSourceType,
  type FinancePayableStatus,
  type FinancePayableView,
} from "@/modules/platform-finance/domain/payables";

function db() {
  return createAdminClient();
}

function throwDb(
  error: { message?: string } | null,
  fallback: string
): never {
  throw new Error(error?.message?.trim() || fallback);
}

type PayableRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  created_by_profile_id: string;
  status: string;
  currency: string;
  payable_amount: number | string;
  paid_amount: number | string;
  payee_name: string;
  payee_type: string;
  description: string | null;
  due_date: string | null;
  source_type: string;
  source_id: string;
  project_contract_ref: string | null;
  period_id: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  organisation_id: string;
  payable_id: string;
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
  payable_id: string;
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

export type { FinancePayableView, FinancePayableSourceRequestSummary };

export function mapFinancePayable(row: PayableRow): FinancePayableView {
  const base: FinancePayable = {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    createdByProfileId: row.created_by_profile_id,
    status: row.status as FinancePayableStatus,
    currency: row.currency,
    payableAmount: Number(row.payable_amount),
    paidAmount: Number(row.paid_amount),
    payeeName: row.payee_name,
    payeeType: row.payee_type as FinancePayablePayeeType,
    description: row.description,
    dueDate: row.due_date,
    sourceType: row.source_type as FinancePayableSourceType,
    sourceId: row.source_id,
    projectContractRef: row.project_contract_ref,
    periodId: row.period_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return toFinancePayableView(base);
}

function mapEvent(row: EventRow): FinancePayableEvent {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    payableId: row.payable_id,
    actorProfileId: row.actor_profile_id,
    eventType: row.event_type as FinancePayableEvent["eventType"],
    fromStatus: (row.from_status as FinancePayableStatus | null) ?? null,
    toStatus: (row.to_status as FinancePayableStatus | null) ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function mapDocument(row: DocumentRow): FinancePayableDocument {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    payableId: row.payable_id,
    uploadedByProfileId: row.uploaded_by_profile_id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    checksum: row.checksum,
    documentRole: row.document_role as FinancePayableDocumentRole,
    uploadedAt: row.uploaded_at,
    supersededAt: row.superseded_at,
    supersededByDocumentId: row.superseded_by_document_id,
  };
}

const PAYABLE_SELECT = "*";

export class PlatformFinancePayablesRepository {
  constructor(private readonly organisationId: string) {}

  async getPayable(payableId: string): Promise<FinancePayableView | null> {
    const { data, error } = await db()
      .from("finance_payables")
      .select(PAYABLE_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("id", payableId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load finance payable.");
    return data ? mapFinancePayable(data as PayableRow) : null;
  }

  async listMyPayables(createdByProfileId: string): Promise<FinancePayableView[]> {
    const { data, error } = await db()
      .from("finance_payables")
      .select(PAYABLE_SELECT)
      .eq("organisation_id", this.organisationId)
      .eq("created_by_profile_id", createdByProfileId)
      .order("created_at", { ascending: false });
    if (error) throwDb(error, "Failed to list my finance payables.");
    return (data ?? []).map((row) => mapFinancePayable(row as PayableRow));
  }

  async listPayablesForCompanies(
    accessibleCompanyIds: string[]
  ): Promise<FinancePayableView[]> {
    if (accessibleCompanyIds.length === 0) return [];
    const { data, error } = await db()
      .from("finance_payables")
      .select(PAYABLE_SELECT)
      .eq("organisation_id", this.organisationId)
      .in("company_id", accessibleCompanyIds)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throwDb(error, "Failed to list finance payables for companies.");
    return (data ?? []).map((row) => mapFinancePayable(row as PayableRow));
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

  async listAccessibleCompanies(profileId: string): Promise<
    Array<{ id: string; code: string; name: string; status: string }>
  > {
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

  async listPayableEvents(payableId: string): Promise<FinancePayableEvent[]> {
    const { data, error } = await db()
      .from("finance_payable_events")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("payable_id", payableId)
      .order("created_at", { ascending: true });
    if (error) throwDb(error, "Failed to list payable events.");
    return (data ?? []).map((row) => mapEvent(row as EventRow));
  }

  async listPayableDocuments(
    payableId: string
  ): Promise<FinancePayableDocument[]> {
    const { data, error } = await db()
      .from("finance_payable_documents")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("payable_id", payableId)
      .order("uploaded_at", { ascending: true });
    if (error) throwDb(error, "Failed to list payable documents.");
    return (data ?? []).map((row) => mapDocument(row as DocumentRow));
  }

  async insertDocumentMetadata(input: {
    id: string;
    payableId: string;
    uploadedByProfileId: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    storageBucket: string;
    storagePath: string;
    documentRole: FinancePayableDocumentRole;
    checksum?: string | null;
  }): Promise<FinancePayableDocument> {
    const { data, error } = await db()
      .from("finance_payable_documents")
      .insert({
        id: input.id,
        organisation_id: this.organisationId,
        payable_id: input.payableId,
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
      throwDb(error, "Failed to insert payable document metadata.");
    }
    return mapDocument(data as DocumentRow);
  }

  async getDocument(
    documentId: string
  ): Promise<FinancePayableDocument | null> {
    const { data, error } = await db()
      .from("finance_payable_documents")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load payable document.");
    return data ? mapDocument(data as DocumentRow) : null;
  }

  async deleteDocumentMetadata(documentId: string): Promise<void> {
    const { error } = await db()
      .from("finance_payable_documents")
      .delete()
      .eq("organisation_id", this.organisationId)
      .eq("id", documentId);
    if (error) throwDb(error, "Failed to delete draft payable document metadata.");
  }

  async markDocumentSuperseded(input: {
    documentId: string;
    supersededByDocumentId: string;
    supersededAt: string;
  }): Promise<FinancePayableDocument> {
    const { data, error } = await db()
      .from("finance_payable_documents")
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
      throwDb(error, "Failed to supersede payable document.");
    }
    return mapDocument(data as DocumentRow);
  }

  async appendPayableEvent(input: {
    payableId: string;
    actorProfileId: string;
    eventType: FinancePayableEvent["eventType"];
    fromStatus?: FinancePayableStatus | null;
    toStatus?: FinancePayableStatus | null;
    metadata?: Record<string, unknown>;
  }): Promise<FinancePayableEvent> {
    const { data, error } = await db()
      .from("finance_payable_events")
      .insert({
        organisation_id: this.organisationId,
        payable_id: input.payableId,
        actor_profile_id: input.actorProfileId,
        event_type: input.eventType,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !data) {
      throwDb(error, "Failed to append payable event.");
    }
    return mapEvent(data as EventRow);
  }

  /**
   * Enrich FR-originated payables from existing request rows only.
   * No invented Vendor Bill fields.
   */
  async getSourceRequestSummary(
    sourceType: FinancePayableSourceType,
    sourceId: string
  ): Promise<FinancePayableSourceRequestSummary | null> {
    if (sourceType !== "financial_request") return null;
    const { data, error } = await db()
      .from("finance_requests")
      .select(
        "id, purpose, category_id, external_reference, required_by_date"
      )
      .eq("organisation_id", this.organisationId)
      .eq("id", sourceId)
      .maybeSingle();
    if (error) throwDb(error, "Failed to load source financial request.");
    if (!data) return null;
    return {
      id: String(data.id),
      purpose: String(data.purpose),
      categoryId: String(data.category_id),
      externalReference: data.external_reference
        ? String(data.external_reference)
        : null,
      requiredByDate: data.required_by_date
        ? String(data.required_by_date)
        : null,
    };
  }
}
