/**
 * Platform Finance Vendor Bills — server service.
 *
 * Callers must gate with requirePlatformFinanceAccess before mutations.
 * Lifecycle writes use named RPCs only; document bytes use private Storage.
 *
 * The Payable is never created here. CEO approval creates it atomically inside
 * finance_vendor_bill_approve / finance_vendor_bill_partially_approve.
 */
import { ActionError, toActionError } from "@/lib/actions/errors";
import {
  FINANCE_VENDOR_BILL_CAPABILITIES,
  FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
  FINANCE_VENDOR_BILL_PAYEE_TYPES,
  PLATFORM_FINANCE_CAPABILITIES,
  type FinanceVendorBillPayeeType,
  type FinanceVendorBillStatus,
} from "@/modules/platform-finance/types";
import { PlatformFinanceVendorBillsRepository } from "@/modules/platform-finance/server/PlatformFinanceVendorBillsRepository";
import {
  buildFinanceVendorBillDocumentStoragePath,
  FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET,
  FINANCE_VENDOR_BILL_DOCUMENT_SIGNED_URL_SECONDS,
  isFinanceVendorBillDocumentRole,
  newFinanceVendorBillDocumentId,
  validateFinanceVendorBillDocumentFile,
} from "@/modules/platform-finance/server/vendorBillDocumentStorage";
import {
  rpcApproveFinanceVendorBill,
  rpcCreateFinanceVendorBill,
  rpcPartiallyApproveFinanceVendorBill,
  rpcQueryFinanceVendorBill,
  rpcRejectFinanceVendorBill,
  rpcResubmitFinanceVendorBill,
  rpcSendFinanceVendorBillToCeo,
  rpcStartFinanceVendorBillReview,
  rpcSubmitFinanceVendorBill,
  rpcUpdateFinanceVendorBillDraft,
} from "@/modules/platform-finance/server/vendorBillTransitions";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  FinanceVendorBill,
  FinanceVendorBillDocument,
  FinanceVendorBillDocumentRole,
  FinanceVendorBillEvent,
  FinanceVendorBillPayableSummary,
} from "@/modules/platform-finance/domain/vendorBills";

export type FinanceVendorBillActorContext = {
  organisationId: string;
  profileId: string;
};

export type FinanceVendorBillDetail = {
  vendorBill: FinanceVendorBill;
  events: FinanceVendorBillEvent[];
  documents: FinanceVendorBillDocument[];
  /** Populated only after CEO approval created the obligation. */
  payable: FinanceVendorBillPayableSummary | null;
  inputter: {
    id: string;
    fullName: string | null;
    jobTitle: string | null;
  } | null;
  actors: Array<{
    id: string;
    fullName: string | null;
    jobTitle: string | null;
  }>;
};

export type FinanceVendorBillCapabilitySet = {
  profileId: string;
  view: boolean;
  create: boolean;
  review: boolean;
  /** CEO approval reuses platform_finance.request.approve. */
  approve: boolean;
  platformView: boolean;
};

function mapRpcError(error: unknown): never {
  const mapped = toActionError(error);
  const message = mapped.message.toLowerCase();
  if (
    message.includes("separation of duties") ||
    message.includes("missing capability") ||
    message.includes("no company access") ||
    message.includes("only the inputter")
  ) {
    throw new ActionError("FORBIDDEN", mapped.message, { cause: error });
  }
  if (
    message.includes("not found") ||
    message.includes("invalid status") ||
    message.includes("required") ||
    message.includes("billed_amount") ||
    message.includes("approved_amount") ||
    message.includes("already exists") ||
    message.includes("only draft") ||
    message.includes("incomplete") ||
    message.includes("must satisfy") ||
    message.includes("cannot be empty") ||
    message.includes("invalid payee_type")
  ) {
    throw new ActionError("VALIDATION_ERROR", mapped.message, { cause: error });
  }
  throw mapped;
}

function assertPayeeType(
  value: string
): asserts value is FinanceVendorBillPayeeType {
  if (!(FINANCE_VENDOR_BILL_PAYEE_TYPES as readonly string[]).includes(value)) {
    throw new ActionError("VALIDATION_ERROR", "Invalid payee type.");
  }
}

export class PlatformFinanceVendorBillsServerService {
  private readonly repo: PlatformFinanceVendorBillsRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceVendorBillsRepository(organisationId);
  }

  get repository(): PlatformFinanceVendorBillsRepository {
    return this.repo;
  }

  private async reload(vendorBillId: string): Promise<FinanceVendorBill> {
    const bill = await this.repo.getVendorBill(vendorBillId);
    if (!bill) {
      throw new ActionError("VALIDATION_ERROR", "Vendor bill not found.");
    }
    return bill;
  }

  private async assertCanView(
    actor: FinanceVendorBillActorContext,
    bill: FinanceVendorBill
  ): Promise<void> {
    if (bill.organisationId !== actor.organisationId) {
      throw new ActionError("FORBIDDEN", "Vendor bill not found.");
    }

    const admin = createAdminClient();
    const isInputter = bill.inputterProfileId === actor.profileId;

    if (isInputter) {
      const { data: ownCap } = await admin
        .from("finance_capability_grants")
        .select("id")
        .eq("organisation_id", actor.organisationId)
        .eq("profile_id", actor.profileId)
        .in("capability", [
          FINANCE_VENDOR_BILL_CAPABILITIES.create,
          FINANCE_VENDOR_BILL_CAPABILITIES.view,
        ])
        .limit(1)
        .maybeSingle();
      if (ownCap) return;
    }

    const { data: access } = await admin
      .from("finance_company_access")
      .select("id")
      .eq("company_id", bill.companyId)
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (!access) {
      throw new ActionError("FORBIDDEN", "Vendor bill not found.");
    }

    const { data: staffCap } = await admin
      .from("finance_capability_grants")
      .select("id")
      .eq("organisation_id", actor.organisationId)
      .eq("profile_id", actor.profileId)
      .in("capability", [
        FINANCE_VENDOR_BILL_CAPABILITIES.view,
        FINANCE_VENDOR_BILL_CAPABILITIES.review,
        FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
        PLATFORM_FINANCE_CAPABILITIES.view,
      ])
      .limit(1)
      .maybeSingle();
    if (!staffCap) {
      throw new ActionError("FORBIDDEN", "Vendor bill not found.");
    }
  }

  async getVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string
  ): Promise<FinanceVendorBill> {
    const bill = await this.repo.getVendorBill(vendorBillId);
    if (!bill) {
      throw new ActionError("VALIDATION_ERROR", "Vendor bill not found.");
    }
    await this.assertCanView(actor, bill);
    return bill;
  }

  async getVendorBillDetail(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string
  ): Promise<FinanceVendorBillDetail> {
    const vendorBill = await this.getVendorBill(actor, vendorBillId);
    const [events, documents, payable] = await Promise.all([
      this.repo.listVendorBillEvents(vendorBillId),
      this.repo.listVendorBillDocuments(vendorBillId),
      this.repo.getPayableForVendorBill(vendorBillId),
    ]);
    const actorIds = [
      vendorBill.inputterProfileId,
      ...events.map((e) => e.actorProfileId),
    ];
    const profiles = await this.repo.listProfileSummaries(actorIds);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return {
      vendorBill,
      events,
      documents,
      payable,
      inputter: byId.get(vendorBill.inputterProfileId) ?? null,
      actors: profiles,
    };
  }

  async listInputterSummaries(
    actor: FinanceVendorBillActorContext,
    profileIds: string[]
  ): Promise<
    Array<{ id: string; fullName: string | null; jobTitle: string | null }>
  > {
    void actor;
    return this.repo.listProfileSummaries(profileIds);
  }

  async listMyVendorBills(
    actor: FinanceVendorBillActorContext
  ): Promise<FinanceVendorBill[]> {
    return this.repo.listMyVendorBills(actor.profileId);
  }

  /** Register collection: bills for accessible companies ∪ own bills. */
  async listAccessibleVendorBills(
    actor: FinanceVendorBillActorContext
  ): Promise<FinanceVendorBill[]> {
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    const [byCompany, mine] = await Promise.all([
      this.repo.listVendorBillsForCompanies(companyIds),
      this.repo.listMyVendorBills(actor.profileId),
    ]);
    const byId = new Map<string, FinanceVendorBill>();
    for (const row of [...byCompany, ...mine]) {
      byId.set(row.id, row);
    }
    return [...byId.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    );
  }

  async listReviewQueue(
    actor: FinanceVendorBillActorContext
  ): Promise<FinanceVendorBill[]> {
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    return this.repo.listReviewQueue(companyIds);
  }

  async listApprovalQueue(
    actor: FinanceVendorBillActorContext
  ): Promise<FinanceVendorBill[]> {
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    return this.repo.listApprovalQueue(companyIds);
  }

  async listAccessibleCompanies(
    actor: FinanceVendorBillActorContext
  ): Promise<Array<{ id: string; code: string; name: string; status: string }>> {
    return this.repo.listAccessibleCompanies(actor.profileId);
  }

  async getMyVendorBillCapabilities(
    actor: FinanceVendorBillActorContext
  ): Promise<FinanceVendorBillCapabilitySet> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", actor.organisationId)
      .eq("profile_id", actor.profileId);
    if (error) {
      throw new ActionError("INTERNAL_ERROR", "Failed to load capabilities.");
    }
    const granted = new Set((data ?? []).map((r) => String(r.capability)));
    return {
      profileId: actor.profileId,
      view: granted.has(FINANCE_VENDOR_BILL_CAPABILITIES.view),
      create: granted.has(FINANCE_VENDOR_BILL_CAPABILITIES.create),
      review: granted.has(FINANCE_VENDOR_BILL_CAPABILITIES.review),
      approve: granted.has(FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY),
      platformView: granted.has(PLATFORM_FINANCE_CAPABILITIES.view),
    };
  }

  async createVendorBill(
    actor: FinanceVendorBillActorContext,
    input: {
      companyId: string;
      billedAmount: number;
      purpose: string;
      payeeName: string;
      payeeType: FinanceVendorBillPayeeType;
      description?: string | null;
      invoiceReference?: string | null;
      invoiceDate?: string | null;
      goodsServicesReceived?: boolean;
      dueDate?: string | null;
      projectContractRef?: string | null;
      currency?: string;
    }
  ): Promise<FinanceVendorBill> {
    if (!input.companyId) {
      throw new ActionError("VALIDATION_ERROR", "companyId is required.");
    }
    if (!input.purpose?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "purpose is required.");
    }
    if (!input.payeeName?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "payeeName is required.");
    }
    assertPayeeType(input.payeeType);
    if (
      typeof input.billedAmount !== "number" ||
      !Number.isFinite(input.billedAmount) ||
      input.billedAmount < 0
    ) {
      throw new ActionError("VALIDATION_ERROR", "billedAmount must be >= 0.");
    }

    let id: string;
    try {
      id = await rpcCreateFinanceVendorBill({
        actorProfileId: actor.profileId,
        organisationId: actor.organisationId,
        companyId: input.companyId,
        billedAmount: input.billedAmount,
        purpose: input.purpose.trim(),
        payeeName: input.payeeName.trim(),
        payeeType: input.payeeType,
        description: input.description ?? null,
        invoiceReference: input.invoiceReference ?? null,
        invoiceDate: input.invoiceDate ?? null,
        goodsServicesReceived: input.goodsServicesReceived ?? false,
        dueDate: input.dueDate ?? null,
        projectContractRef: input.projectContractRef ?? null,
        currency: input.currency ?? "NGN",
      });
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(id);
  }

  async updateDraftVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string,
    input: {
      billedAmount?: number | null;
      purpose?: string | null;
      payeeName?: string | null;
      payeeType?: FinanceVendorBillPayeeType | null;
      description?: string | null;
      invoiceReference?: string | null;
      invoiceDate?: string | null;
      clearInvoiceDate?: boolean;
      goodsServicesReceived?: boolean | null;
      dueDate?: string | null;
      clearDueDate?: boolean;
      projectContractRef?: string | null;
      currency?: string | null;
    }
  ): Promise<FinanceVendorBill> {
    if (input.payeeType != null) assertPayeeType(input.payeeType);
    if (
      input.billedAmount !== undefined &&
      input.billedAmount !== null &&
      (typeof input.billedAmount !== "number" ||
        !Number.isFinite(input.billedAmount) ||
        input.billedAmount < 0)
    ) {
      throw new ActionError("VALIDATION_ERROR", "billedAmount must be >= 0.");
    }
    try {
      await rpcUpdateFinanceVendorBillDraft({
        actorProfileId: actor.profileId,
        vendorBillId,
        billedAmount: input.billedAmount,
        purpose: input.purpose,
        payeeName: input.payeeName,
        payeeType: input.payeeType,
        description: input.description,
        invoiceReference: input.invoiceReference,
        invoiceDate: input.invoiceDate,
        clearInvoiceDate: input.clearInvoiceDate,
        goodsServicesReceived: input.goodsServicesReceived,
        dueDate: input.dueDate,
        clearDueDate: input.clearDueDate,
        projectContractRef: input.projectContractRef,
        currency: input.currency,
      });
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(vendorBillId);
  }

  async submitVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string
  ): Promise<FinanceVendorBill> {
    try {
      await rpcSubmitFinanceVendorBill(actor.profileId, vendorBillId);
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(vendorBillId);
  }

  async startReview(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string
  ): Promise<FinanceVendorBill> {
    try {
      await rpcStartFinanceVendorBillReview(actor.profileId, vendorBillId);
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(vendorBillId);
  }

  /** Finance queries UNDER_REVIEW; CEO queries PENDING_CEO_APPROVAL. */
  async queryVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string,
    reason: string,
    actorRole: "finance" | "ceo"
  ): Promise<FinanceVendorBill> {
    if (!reason?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "Query reason is required.");
    }
    if (actorRole !== "finance" && actorRole !== "ceo") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "actorRole must be finance or ceo."
      );
    }
    try {
      await rpcQueryFinanceVendorBill(
        actor.profileId,
        vendorBillId,
        reason.trim(),
        actorRole
      );
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(vendorBillId);
  }

  /** Only the inputter resolves a query. */
  async resubmitVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string,
    input: {
      billedAmount?: number | null;
      purpose?: string | null;
      payeeName?: string | null;
      payeeType?: FinanceVendorBillPayeeType | null;
      description?: string | null;
      invoiceReference?: string | null;
      invoiceDate?: string | null;
      clearInvoiceDate?: boolean;
      goodsServicesReceived?: boolean | null;
      dueDate?: string | null;
      clearDueDate?: boolean;
      projectContractRef?: string | null;
    } = {}
  ): Promise<FinanceVendorBill> {
    if (input.payeeType != null) assertPayeeType(input.payeeType);
    if (
      input.billedAmount !== undefined &&
      input.billedAmount !== null &&
      (typeof input.billedAmount !== "number" ||
        !Number.isFinite(input.billedAmount) ||
        input.billedAmount <= 0)
    ) {
      throw new ActionError("VALIDATION_ERROR", "billedAmount must be > 0.");
    }
    try {
      await rpcResubmitFinanceVendorBill({
        actorProfileId: actor.profileId,
        vendorBillId,
        billedAmount: input.billedAmount,
        purpose: input.purpose,
        payeeName: input.payeeName,
        payeeType: input.payeeType,
        description: input.description,
        invoiceReference: input.invoiceReference,
        invoiceDate: input.invoiceDate,
        clearInvoiceDate: input.clearInvoiceDate,
        goodsServicesReceived: input.goodsServicesReceived,
        dueDate: input.dueDate,
        clearDueDate: input.clearDueDate,
        projectContractRef: input.projectContractRef,
      });
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(vendorBillId);
  }

  async sendToCeo(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string,
    financeNotes?: string | null
  ): Promise<FinanceVendorBill> {
    try {
      await rpcSendFinanceVendorBillToCeo(
        actor.profileId,
        vendorBillId,
        financeNotes ?? null
      );
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(vendorBillId);
  }

  /**
   * CEO full approval. The Payable is created in the same SQL transaction —
   * this method never inserts a payable itself.
   */
  async approveVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string,
    decisionNotes?: string | null
  ): Promise<FinanceVendorBillDetail> {
    try {
      await rpcApproveFinanceVendorBill(
        actor.profileId,
        vendorBillId,
        decisionNotes ?? null
      );
    } catch (error) {
      mapRpcError(error);
    }
    return this.getVendorBillDetail(actor, vendorBillId);
  }

  async partiallyApproveVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string,
    approvedAmount: number,
    decisionNotes?: string | null
  ): Promise<FinanceVendorBillDetail> {
    if (
      typeof approvedAmount !== "number" ||
      !Number.isFinite(approvedAmount) ||
      approvedAmount <= 0
    ) {
      throw new ActionError("VALIDATION_ERROR", "approvedAmount must be > 0.");
    }
    try {
      await rpcPartiallyApproveFinanceVendorBill(
        actor.profileId,
        vendorBillId,
        approvedAmount,
        decisionNotes ?? null
      );
    } catch (error) {
      mapRpcError(error);
    }
    return this.getVendorBillDetail(actor, vendorBillId);
  }

  /** Terminal; creates no Payable. */
  async rejectVendorBill(
    actor: FinanceVendorBillActorContext,
    vendorBillId: string,
    reason: string
  ): Promise<FinanceVendorBill> {
    if (!reason?.trim()) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Rejection reason is required."
      );
    }
    try {
      await rpcRejectFinanceVendorBill(
        actor.profileId,
        vendorBillId,
        reason.trim()
      );
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(vendorBillId);
  }

  private async assertInputterCanMutateDocuments(
    actor: FinanceVendorBillActorContext,
    bill: FinanceVendorBill
  ): Promise<void> {
    if (bill.organisationId !== actor.organisationId) {
      throw new ActionError("FORBIDDEN", "Vendor bill not found.");
    }
    if (bill.inputterProfileId !== actor.profileId) {
      throw new ActionError(
        "FORBIDDEN",
        "Only the inputter may manage documents on this vendor bill."
      );
    }
    const caps = await this.getMyVendorBillCapabilities(actor);
    if (!caps.create) {
      throw new ActionError(
        "FORBIDDEN",
        "Missing capability platform_finance.vendor_bill.create."
      );
    }
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!companyIds.includes(bill.companyId)) {
      throw new ActionError(
        "FORBIDDEN",
        "No company access for this vendor bill."
      );
    }
  }

  private async removeStorageObject(
    bucket: string,
    path: string
  ): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (error) {
      throw new ActionError(
        "INTERNAL_ERROR",
        `Failed to remove storage object: ${error.message}`
      );
    }
  }

  private async uploadStorageObject(input: {
    bucket: string;
    path: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(input.bucket)
      .upload(input.path, input.bytes, {
        contentType: input.mimeType,
        upsert: false,
      });
    if (error) {
      const msg = error.message ?? "upload failed";
      if (/bucket not found/i.test(msg)) {
        throw new ActionError(
          "INTERNAL_ERROR",
          `Storage bucket ${input.bucket} is not configured. Apply the finance vendor bill documents storage migration.`
        );
      }
      throw new ActionError(
        "INTERNAL_ERROR",
        `Failed to upload document bytes: ${msg}`
      );
    }
  }

  /**
   * Upload bytes to private Storage, then persist metadata + document_added.
   * Compensates Storage if metadata/event persistence fails.
   */
  async uploadDocument(
    actor: FinanceVendorBillActorContext,
    input: {
      vendorBillId: string;
      documentRole: FinanceVendorBillDocumentRole;
      filename: string;
      declaredMimeType?: string | null;
      bytes: Buffer;
    }
  ): Promise<FinanceVendorBillDocument> {
    if (!isFinanceVendorBillDocumentRole(input.documentRole)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid document role.");
    }

    let validated;
    try {
      validated = validateFinanceVendorBillDocumentFile({
        filename: input.filename,
        declaredMimeType: input.declaredMimeType,
        bytes: input.bytes,
      });
    } catch (e) {
      throw new ActionError(
        "VALIDATION_ERROR",
        e instanceof Error ? e.message : "Invalid document file."
      );
    }

    const bill = await this.reload(input.vendorBillId);
    await this.assertInputterCanMutateDocuments(actor, bill);

    const uploadable: FinanceVendorBillStatus[] = [
      "draft",
      "query",
      "resubmitted",
    ];
    if (!uploadable.includes(bill.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Documents can only be added while the vendor bill is draft, query, or resubmitted."
      );
    }

    const documentId = newFinanceVendorBillDocumentId();
    const storagePath = buildFinanceVendorBillDocumentStoragePath({
      organisationId: bill.organisationId,
      companyId: bill.companyId,
      vendorBillId: bill.id,
      documentId,
      filename: validated.filename,
    });

    await this.uploadStorageObject({
      bucket: FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET,
      path: storagePath,
      bytes: validated.bytes,
      mimeType: validated.mimeType,
    });

    let document: FinanceVendorBillDocument;
    try {
      document = await this.repo.insertDocumentMetadata({
        id: documentId,
        vendorBillId: bill.id,
        uploadedByProfileId: actor.profileId,
        filename: validated.filename,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        storageBucket: FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET,
        storagePath,
        documentRole: input.documentRole,
        checksum: validated.checksum,
      });
      await this.repo.appendVendorBillEvent({
        vendorBillId: bill.id,
        actorProfileId: actor.profileId,
        eventType: "document_added",
        fromStatus: bill.status,
        toStatus: bill.status,
        metadata: {
          documentId: document.id,
          documentRole: document.documentRole,
          filename: document.filename,
          byteSize: document.byteSize,
          mimeType: document.mimeType,
        },
      });
    } catch (error) {
      try {
        await this.removeStorageObject(
          FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET,
          storagePath
        );
      } catch (cleanupError) {
        throw new ActionError(
          "INTERNAL_ERROR",
          `Document metadata failed and storage cleanup also failed (${
            cleanupError instanceof Error
              ? cleanupError.message
              : "unknown cleanup error"
          }). Original: ${
            error instanceof Error ? error.message : "metadata failure"
          }`
        );
      }
      if (error instanceof ActionError) throw error;
      throw new ActionError(
        "INTERNAL_ERROR",
        error instanceof Error
          ? error.message
          : "Failed to persist document metadata."
      );
    }

    return document;
  }

  /** Hard-remove an active document from a DRAFT vendor bill. */
  async removeDocument(
    actor: FinanceVendorBillActorContext,
    input: { vendorBillId: string; documentId: string }
  ): Promise<{ removedDocumentId: string }> {
    const bill = await this.reload(input.vendorBillId);
    await this.assertInputterCanMutateDocuments(actor, bill);
    if (bill.status !== "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Only draft documents may be removed; use supersession after submission."
      );
    }

    const document = await this.repo.getDocument(input.documentId);
    if (!document || document.vendorBillId !== bill.id) {
      throw new ActionError("VALIDATION_ERROR", "Document not found.");
    }
    if (document.supersededAt) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Document is already superseded."
      );
    }

    await this.repo.deleteDocumentMetadata(document.id);
    try {
      await this.removeStorageObject(
        document.storageBucket,
        document.storagePath
      );
    } catch (cleanupError) {
      throw new ActionError(
        "INTERNAL_ERROR",
        `Draft document metadata was removed but storage cleanup failed: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : "unknown cleanup error"
        }`
      );
    }

    await this.repo.appendVendorBillEvent({
      vendorBillId: bill.id,
      actorProfileId: actor.profileId,
      eventType: "document_removed",
      fromStatus: bill.status,
      toStatus: bill.status,
      metadata: {
        documentId: document.id,
        documentRole: document.documentRole,
        filename: document.filename,
      },
    });

    return { removedDocumentId: document.id };
  }

  /**
   * Non-draft supersession: keep history, replace active bytes.
   * Blocked for draft (use remove) and after a CEO decision.
   */
  async supersedeDocument(
    actor: FinanceVendorBillActorContext,
    input: {
      vendorBillId: string;
      documentId: string;
      filename: string;
      declaredMimeType?: string | null;
      bytes: Buffer;
      documentRole?: FinanceVendorBillDocumentRole;
    }
  ): Promise<{
    previous: FinanceVendorBillDocument;
    replacement: FinanceVendorBillDocument;
  }> {
    let validated;
    try {
      validated = validateFinanceVendorBillDocumentFile({
        filename: input.filename,
        declaredMimeType: input.declaredMimeType,
        bytes: input.bytes,
      });
    } catch (e) {
      throw new ActionError(
        "VALIDATION_ERROR",
        e instanceof Error ? e.message : "Invalid document file."
      );
    }

    const bill = await this.reload(input.vendorBillId);
    await this.assertInputterCanMutateDocuments(actor, bill);
    if (bill.status === "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Use removeDocument for draft documents."
      );
    }
    const decided: FinanceVendorBillStatus[] = [
      "approved",
      "partially_approved",
      "rejected",
    ];
    if (decided.includes(bill.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Documents cannot be changed after the CEO decision."
      );
    }

    const previous = await this.repo.getDocument(input.documentId);
    if (!previous || previous.vendorBillId !== bill.id) {
      throw new ActionError("VALIDATION_ERROR", "Document not found.");
    }
    if (previous.supersededAt) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Document is already superseded."
      );
    }

    const role = input.documentRole ?? previous.documentRole;
    if (!isFinanceVendorBillDocumentRole(role)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid document role.");
    }

    const replacementId = newFinanceVendorBillDocumentId();
    const storagePath = buildFinanceVendorBillDocumentStoragePath({
      organisationId: bill.organisationId,
      companyId: bill.companyId,
      vendorBillId: bill.id,
      documentId: replacementId,
      filename: validated.filename,
    });

    await this.uploadStorageObject({
      bucket: FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET,
      path: storagePath,
      bytes: validated.bytes,
      mimeType: validated.mimeType,
    });

    let replacement: FinanceVendorBillDocument;
    let superseded: FinanceVendorBillDocument;
    try {
      replacement = await this.repo.insertDocumentMetadata({
        id: replacementId,
        vendorBillId: bill.id,
        uploadedByProfileId: actor.profileId,
        filename: validated.filename,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        storageBucket: FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET,
        storagePath,
        documentRole: role,
        checksum: validated.checksum,
      });
      superseded = await this.repo.markDocumentSuperseded({
        documentId: previous.id,
        supersededByDocumentId: replacement.id,
        supersededAt: new Date().toISOString(),
      });
      await this.repo.appendVendorBillEvent({
        vendorBillId: bill.id,
        actorProfileId: actor.profileId,
        eventType: "document_superseded",
        fromStatus: bill.status,
        toStatus: bill.status,
        metadata: {
          previousDocumentId: previous.id,
          replacementDocumentId: replacement.id,
          documentRole: role,
          filename: replacement.filename,
        },
      });
      await this.repo.appendVendorBillEvent({
        vendorBillId: bill.id,
        actorProfileId: actor.profileId,
        eventType: "document_added",
        fromStatus: bill.status,
        toStatus: bill.status,
        metadata: {
          documentId: replacement.id,
          documentRole: replacement.documentRole,
          filename: replacement.filename,
          byteSize: replacement.byteSize,
          mimeType: replacement.mimeType,
          supersedesDocumentId: previous.id,
        },
      });
    } catch (error) {
      try {
        await createAdminClient()
          .from("finance_vendor_bill_documents")
          .update({
            superseded_at: null,
            superseded_by_document_id: null,
          })
          .eq("id", previous.id)
          .eq("organisation_id", this.organisationId);
        await this.repo
          .deleteDocumentMetadata(replacementId)
          .catch(() => undefined);
        await this.removeStorageObject(
          FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET,
          storagePath
        );
      } catch (cleanupError) {
        throw new ActionError(
          "INTERNAL_ERROR",
          `Supersession failed and cleanup also failed (${
            cleanupError instanceof Error
              ? cleanupError.message
              : "unknown cleanup error"
          }). Original: ${
            error instanceof Error ? error.message : "supersession failure"
          }`
        );
      }
      if (error instanceof ActionError) throw error;
      throw new ActionError(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "Failed to supersede document."
      );
    }

    return { previous: superseded, replacement };
  }

  /**
   * Authorized short-lived signed URL — never a permanent public URL.
   * Path is derived from persisted document metadata only.
   */
  async getDocumentSignedUrl(
    actor: FinanceVendorBillActorContext,
    input: { vendorBillId: string; documentId: string }
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    const bill = await this.getVendorBill(actor, input.vendorBillId);
    const document = await this.repo.getDocument(input.documentId);
    if (!document || document.vendorBillId !== bill.id) {
      throw new ActionError("VALIDATION_ERROR", "Document not found.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(document.storageBucket)
      .createSignedUrl(
        document.storagePath,
        FINANCE_VENDOR_BILL_DOCUMENT_SIGNED_URL_SECONDS
      );
    if (error || !data?.signedUrl) {
      throw new ActionError(
        "INTERNAL_ERROR",
        error?.message ?? "Failed to create signed document URL."
      );
    }
    return {
      signedUrl: data.signedUrl,
      expiresInSeconds: FINANCE_VENDOR_BILL_DOCUMENT_SIGNED_URL_SECONDS,
    };
  }
}
