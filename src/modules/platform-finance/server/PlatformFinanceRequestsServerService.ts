import { ActionError, toActionError } from "@/lib/actions/errors";
import {
  FINANCIAL_REQUEST_CAPABILITIES,
  FINANCIAL_REQUEST_PAYEE_TYPES,
  PLATFORM_FINANCE_CAPABILITIES,
  type FinancialRequest,
  type FinancialRequestCategory,
  type FinancialRequestDocument,
  type FinancialRequestDocumentRole,
  type FinancialRequestEvent,
  type FinancialRequestPayeeType,
  type FinancialRequestStatus,
  type PaymentDestinationInput,
  type PaymentDestinationMutation,
} from "@/modules/platform-finance/types";
import {
  encryptPaymentDestination,
  preparePaymentDestinationMutation,
} from "@/modules/platform-finance/server/paymentDestinationCryptoCore";
import { PlatformFinanceRequestsRepository } from "@/modules/platform-finance/server/PlatformFinanceRequestsRepository";
import {
  buildFinanceRequestDocumentStoragePath,
  FINANCE_REQUEST_DOCUMENTS_BUCKET,
  FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS,
  isFinanceRequestDocumentRole,
  newFinanceRequestDocumentId,
  validateFinanceRequestDocumentFile,
} from "@/modules/platform-finance/server/requestDocumentStorage";
import {
  rpcApproveFinancialRequest,
  rpcCreateFinancialRequest,
  rpcPartiallyApproveFinancialRequest,
  rpcQueryFinancialRequest,
  rpcRejectFinancialRequest,
  rpcResubmitFinancialRequest,
  rpcSendFinancialRequestToCeo,
  rpcStartFinancialRequestReview,
  rpcSubmitFinancialRequest,
  rpcUpdateDraftFinancialRequest,
} from "@/modules/platform-finance/server/requestTransitions";
import { createAdminClient } from "@/utils/supabase/admin";

export type FinancialRequestActorContext = {
  organisationId: string;
  profileId: string;
};

function mapRpcError(error: unknown): never {
  const mapped = toActionError(error);
  const message = mapped.message.toLowerCase();
  if (
    message.includes("separation of duties") ||
    message.includes("missing capability") ||
    message.includes("no company access")
  ) {
    throw new ActionError("FORBIDDEN", mapped.message, { cause: error });
  }
  if (
    message.includes("not found") ||
    message.includes("invalid status") ||
    message.includes("required") ||
    message.includes("supporting documentation") ||
    message.includes("approved_amount") ||
    message.includes("requested_amount") ||
    message.includes("incomplete") ||
    message.includes("only draft") ||
    message.includes("only the requester")
  ) {
    throw new ActionError("VALIDATION_ERROR", mapped.message, { cause: error });
  }
  throw mapped;
}

function assertPayeeType(value: string): asserts value is FinancialRequestPayeeType {
  if (
    !(FINANCIAL_REQUEST_PAYEE_TYPES as readonly string[]).includes(value)
  ) {
    throw new ActionError("VALIDATION_ERROR", "Invalid payee type.");
  }
}

/**
 * Financial Requests Slice 2 domain service.
 * Callers must gate with requirePlatformFinanceAccess for the matching capability
 * and companyId before invoking mutations (Foundation pattern).
 * Slice 3 exposes this via /api/platform-finance/requests (thin boundary only).
 */
export class PlatformFinanceRequestsServerService {
  private readonly repo: PlatformFinanceRequestsRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRequestsRepository(organisationId);
  }

  private async reload(requestId: string): Promise<FinancialRequest> {
    const request = await this.repo.getRequest(requestId);
    if (!request) {
      throw new ActionError("VALIDATION_ERROR", "Financial request not found.");
    }
    return request;
  }

  private async assertCanView(
    actor: FinancialRequestActorContext,
    request: FinancialRequest
  ): Promise<void> {
    if (request.organisationId !== actor.organisationId) {
      throw new ActionError("FORBIDDEN", "Financial request not found.");
    }

    const admin = createAdminClient();
    const isOwner = request.requesterProfileId === actor.profileId;

    if (isOwner) {
      const { data: ownCap } = await admin
        .from("finance_capability_grants")
        .select("id")
        .eq("organisation_id", actor.organisationId)
        .eq("profile_id", actor.profileId)
        .in("capability", [
          FINANCIAL_REQUEST_CAPABILITIES.create,
          FINANCIAL_REQUEST_CAPABILITIES.view_own,
          PLATFORM_FINANCE_CAPABILITIES.view,
        ])
        .limit(1)
        .maybeSingle();
      if (ownCap) return;
    }

    const { data: access } = await admin
      .from("finance_company_access")
      .select("id")
      .eq("company_id", request.companyId)
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (!access) {
      throw new ActionError("FORBIDDEN", "Financial request not found.");
    }

    const { data: staffCap } = await admin
      .from("finance_capability_grants")
      .select("id")
      .eq("organisation_id", actor.organisationId)
      .eq("profile_id", actor.profileId)
      .in("capability", [
        FINANCIAL_REQUEST_CAPABILITIES.review,
        FINANCIAL_REQUEST_CAPABILITIES.approve,
        PLATFORM_FINANCE_CAPABILITIES.view,
      ])
      .limit(1)
      .maybeSingle();
    if (!staffCap) {
      throw new ActionError("FORBIDDEN", "Financial request not found.");
    }
  }

  async getRequest(
    actor: FinancialRequestActorContext,
    requestId: string
  ): Promise<FinancialRequest> {
    const request = await this.repo.getRequest(requestId);
    if (!request) {
      throw new ActionError("VALIDATION_ERROR", "Financial request not found.");
    }
    await this.assertCanView(actor, request);
    return request;
  }

  async getRequestDetail(
    actor: FinancialRequestActorContext,
    requestId: string
  ): Promise<{
    request: FinancialRequest;
    events: FinancialRequestEvent[];
    documents: FinancialRequestDocument[];
    requester: {
      id: string;
      fullName: string | null;
      jobTitle: string | null;
    } | null;
  }> {
    const request = await this.getRequest(actor, requestId);
    const [events, documents, profiles] = await Promise.all([
      this.repo.listRequestEvents(requestId),
      this.repo.listRequestDocuments(requestId),
      this.repo.listProfileSummaries([request.requesterProfileId]),
    ]);
    return {
      request,
      events,
      documents,
      requester: profiles[0] ?? null,
    };
  }

  async listMyRequests(
    actor: FinancialRequestActorContext
  ): Promise<FinancialRequest[]> {
    return this.repo.listMyRequests(actor.profileId);
  }

  async listReviewQueue(
    actor: FinancialRequestActorContext
  ): Promise<FinancialRequest[]> {
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    return this.repo.listReviewQueue(companyIds);
  }

  async listApprovalQueue(
    actor: FinancialRequestActorContext
  ): Promise<FinancialRequest[]> {
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    return this.repo.listApprovalQueue(companyIds);
  }

  /**
   * Register "All" collection: requests for companies the actor can access,
   * plus the actor's own requests (even if company access is narrower).
   */
  async listAccessibleRequests(
    actor: FinancialRequestActorContext
  ): Promise<FinancialRequest[]> {
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    const [byCompany, mine] = await Promise.all([
      this.repo.listRequestsForCompanies(companyIds),
      this.repo.listMyRequests(actor.profileId),
    ]);
    const byId = new Map<string, FinancialRequest>();
    for (const row of [...byCompany, ...mine]) {
      byId.set(row.id, row);
    }
    return [...byId.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    );
  }

  async listCategories(
    actor: FinancialRequestActorContext
  ): Promise<FinancialRequestCategory[]> {
    void actor;
    return this.repo.listCategories();
  }

  async listRequesterSummaries(
    actor: FinancialRequestActorContext,
    profileIds: string[]
  ): Promise<
    Array<{ id: string; fullName: string | null; jobTitle: string | null }>
  > {
    void actor;
    return this.repo.listProfileSummaries(profileIds);
  }

  async listAccessibleCompanies(
    actor: FinancialRequestActorContext
  ): Promise<Array<{ id: string; code: string; name: string; status: string }>> {
    return this.repo.listAccessibleCompanies(actor.profileId);
  }

  async getMyRequestCapabilities(
    actor: FinancialRequestActorContext
  ): Promise<{
    profileId: string;
    create: boolean;
    viewOwn: boolean;
    review: boolean;
    approve: boolean;
    view: boolean;
  }> {
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
      create: granted.has(FINANCIAL_REQUEST_CAPABILITIES.create),
      viewOwn: granted.has(FINANCIAL_REQUEST_CAPABILITIES.view_own),
      review: granted.has(FINANCIAL_REQUEST_CAPABILITIES.review),
      approve: granted.has(FINANCIAL_REQUEST_CAPABILITIES.approve),
      view: granted.has(PLATFORM_FINANCE_CAPABILITIES.view),
    };
  }

  async createRequest(
    actor: FinancialRequestActorContext,
    input: {
      companyId: string;
      categoryId: string;
      requestedAmount: number;
      purpose: string;
      description?: string | null;
      payeeName: string;
      payeeType: FinancialRequestPayeeType;
      requiredByDate?: string | null;
      externalReference?: string | null;
      projectContractRef?: string | null;
      currency?: string;
      paymentDestination?: PaymentDestinationInput | null;
    }
  ): Promise<FinancialRequest> {
    if (!input.companyId) {
      throw new ActionError("VALIDATION_ERROR", "companyId is required.");
    }
    if (!input.categoryId) {
      throw new ActionError("VALIDATION_ERROR", "categoryId is required.");
    }
    if (
      typeof input.requestedAmount !== "number" ||
      !Number.isFinite(input.requestedAmount) ||
      input.requestedAmount < 0
    ) {
      throw new ActionError("VALIDATION_ERROR", "requestedAmount must be >= 0.");
    }
    if (!input.purpose?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "purpose is required.");
    }
    if (!input.payeeName?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "payeeName is required.");
    }
    assertPayeeType(input.payeeType);

    try {
      const encryptedPaymentDestination = input.paymentDestination
        ? encryptPaymentDestination(input.paymentDestination)
        : null;
      const id = await rpcCreateFinancialRequest({
        actorProfileId: actor.profileId,
        organisationId: actor.organisationId,
        companyId: input.companyId,
        categoryId: input.categoryId,
        requestedAmount: input.requestedAmount,
        purpose: input.purpose.trim(),
        description: input.description ?? null,
        payeeName: input.payeeName.trim(),
        payeeType: input.payeeType,
        requiredByDate: input.requiredByDate ?? null,
        externalReference: input.externalReference ?? null,
        projectContractRef: input.projectContractRef ?? null,
        currency: input.currency ?? "NGN",
        encryptedPaymentDestination,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async updateDraftRequest(
    actor: FinancialRequestActorContext,
    requestId: string,
    input: {
      categoryId?: string | null;
      requestedAmount?: number | null;
      purpose?: string | null;
      description?: string | null;
      payeeName?: string | null;
      payeeType?: FinancialRequestPayeeType | null;
      requiredByDate?: string | null;
      clearRequiredByDate?: boolean;
      externalReference?: string | null;
      projectContractRef?: string | null;
      paymentDestinationMutation?: PaymentDestinationMutation;
    }
  ): Promise<FinancialRequest> {
    if (input.payeeType != null) assertPayeeType(input.payeeType);
    if (
      input.requestedAmount != null &&
      (typeof input.requestedAmount !== "number" ||
        !Number.isFinite(input.requestedAmount) ||
        input.requestedAmount < 0)
    ) {
      throw new ActionError("VALIDATION_ERROR", "requestedAmount must be >= 0.");
    }

    try {
      const destination = preparePaymentDestinationMutation(
        input.paymentDestinationMutation
      );
      const id = await rpcUpdateDraftFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        ...input,
        paymentDestinationAction: destination.action,
        encryptedPaymentDestination: destination.encrypted,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async submitRequest(
    actor: FinancialRequestActorContext,
    requestId: string
  ): Promise<FinancialRequest> {
    try {
      const id = await rpcSubmitFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async startRequestReview(
    actor: FinancialRequestActorContext,
    requestId: string
  ): Promise<FinancialRequest> {
    try {
      const id = await rpcStartFinancialRequestReview({
        actorProfileId: actor.profileId,
        requestId,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async queryRequest(
    actor: FinancialRequestActorContext,
    requestId: string,
    input: { reason: string; actorRole: "finance" | "ceo" }
  ): Promise<FinancialRequest> {
    if (!input.reason?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "Query reason is required.");
    }
    try {
      const id = await rpcQueryFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        reason: input.reason.trim(),
        actorRole: input.actorRole,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async resubmitRequest(
    actor: FinancialRequestActorContext,
    requestId: string,
    input: {
      categoryId?: string | null;
      requestedAmount?: number | null;
      purpose?: string | null;
      description?: string | null;
      payeeName?: string | null;
      payeeType?: FinancialRequestPayeeType | null;
      requiredByDate?: string | null;
      clearRequiredByDate?: boolean;
      externalReference?: string | null;
      projectContractRef?: string | null;
      paymentDestinationMutation?: PaymentDestinationMutation;
    } = {}
  ): Promise<FinancialRequest> {
    if (input.payeeType != null) assertPayeeType(input.payeeType);
    try {
      const destination = preparePaymentDestinationMutation(
        input.paymentDestinationMutation
      );
      const id = await rpcResubmitFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        ...input,
        paymentDestinationAction: destination.action,
        encryptedPaymentDestination: destination.encrypted,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async sendRequestToCeo(
    actor: FinancialRequestActorContext,
    requestId: string,
    financeNotes?: string | null
  ): Promise<FinancialRequest> {
    try {
      const id = await rpcSendFinancialRequestToCeo({
        actorProfileId: actor.profileId,
        requestId,
        financeNotes,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async approveRequest(
    actor: FinancialRequestActorContext,
    requestId: string,
    decisionNotes?: string | null
  ): Promise<FinancialRequest> {
    try {
      const id = await rpcApproveFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        decisionNotes,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async partiallyApproveRequest(
    actor: FinancialRequestActorContext,
    requestId: string,
    input: { approvedAmount: number; decisionNotes?: string | null }
  ): Promise<FinancialRequest> {
    if (
      typeof input.approvedAmount !== "number" ||
      !Number.isFinite(input.approvedAmount)
    ) {
      throw new ActionError("VALIDATION_ERROR", "approvedAmount is required.");
    }
    try {
      const id = await rpcPartiallyApproveFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        approvedAmount: input.approvedAmount,
        decisionNotes: input.decisionNotes,
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  async rejectRequest(
    actor: FinancialRequestActorContext,
    requestId: string,
    reason: string
  ): Promise<FinancialRequest> {
    if (!reason?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "Rejection reason is required.");
    }
    try {
      const id = await rpcRejectFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        reason: reason.trim(),
      });
      return this.reload(id);
    } catch (error) {
      mapRpcError(error);
    }
  }

  /**
   * Hard-delete a DRAFT request (and cascaded children). Cleans Storage objects.
   * Named draft-only operation — not a generic delete.
   */
  async deleteDraftRequest(
    actor: FinancialRequestActorContext,
    requestId: string
  ): Promise<{ deletedRequestId: string }> {
    const request = await this.reload(requestId);
    if (request.organisationId !== actor.organisationId) {
      throw new ActionError("FORBIDDEN", "Financial request not found.");
    }
    if (request.requesterProfileId !== actor.profileId) {
      throw new ActionError(
        "FORBIDDEN",
        "Only the requester may delete this draft."
      );
    }
    if (request.status !== "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Only draft financial requests may be deleted."
      );
    }
    const caps = await this.getMyRequestCapabilities(actor);
    if (!caps.create) {
      throw new ActionError(
        "FORBIDDEN",
        "Missing capability platform_finance.request.create."
      );
    }

    const documents = await this.repo.listRequestDocuments(requestId);
    const storagePaths = documents.map((d) => ({
      bucket: d.storageBucket,
      path: d.storagePath,
    }));

    await this.repo.deleteDraftRequest(requestId);

    for (const obj of storagePaths) {
      try {
        await this.removeStorageObject(obj.bucket, obj.path);
      } catch {
        // Metadata already gone via cascade; surface storage leftovers as soft failure.
      }
    }

    return { deletedRequestId: requestId };
  }

  private async assertRequesterCanMutateDocuments(
    actor: FinancialRequestActorContext,
    request: FinancialRequest
  ): Promise<void> {
    if (request.organisationId !== actor.organisationId) {
      throw new ActionError("FORBIDDEN", "Financial request not found.");
    }
    if (request.requesterProfileId !== actor.profileId) {
      throw new ActionError(
        "FORBIDDEN",
        "Only the requester may manage documents on this request."
      );
    }
    const caps = await this.getMyRequestCapabilities(actor);
    if (!caps.create) {
      throw new ActionError(
        "FORBIDDEN",
        "Missing capability platform_finance.request.create."
      );
    }
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!companyIds.includes(request.companyId)) {
      throw new ActionError("FORBIDDEN", "No company access for this request.");
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
    const { error } = await admin.storage.from(input.bucket).upload(
      input.path,
      input.bytes,
      {
        contentType: input.mimeType,
        upsert: false,
      }
    );
    if (error) {
      const msg = error.message ?? "upload failed";
      if (/bucket not found/i.test(msg)) {
        throw new ActionError(
          "INTERNAL_ERROR",
          `Storage bucket ${input.bucket} is not configured. Apply finance request documents storage migration.`
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
  async uploadRequestDocument(
    actor: FinancialRequestActorContext,
    input: {
      requestId: string;
      documentRole: FinancialRequestDocumentRole;
      filename: string;
      declaredMimeType?: string | null;
      bytes: Buffer;
    }
  ): Promise<FinancialRequestDocument> {
    if (!isFinanceRequestDocumentRole(input.documentRole)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid document role.");
    }

    let validated;
    try {
      validated = validateFinanceRequestDocumentFile({
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

    const request = await this.reload(input.requestId);
    await this.assertRequesterCanMutateDocuments(actor, request);

    const uploadable: FinancialRequestStatus[] = [
      "draft",
      "query",
      "resubmitted",
    ];
    if (!uploadable.includes(request.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Documents can only be added while the request is draft, query, or resubmitted."
      );
    }

    const documentId = newFinanceRequestDocumentId();
    const storagePath = buildFinanceRequestDocumentStoragePath({
      organisationId: request.organisationId,
      companyId: request.companyId,
      requestId: request.id,
      documentId,
      filename: validated.filename,
    });

    await this.uploadStorageObject({
      bucket: FINANCE_REQUEST_DOCUMENTS_BUCKET,
      path: storagePath,
      bytes: validated.bytes,
      mimeType: validated.mimeType,
    });

    let document: FinancialRequestDocument;
    try {
      document = await this.repo.insertDocumentMetadata({
        id: documentId,
        requestId: request.id,
        uploadedByProfileId: actor.profileId,
        filename: validated.filename,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        storageBucket: FINANCE_REQUEST_DOCUMENTS_BUCKET,
        storagePath,
        documentRole: input.documentRole,
        checksum: validated.checksum,
      });
      await this.repo.appendRequestEvent({
        requestId: request.id,
        actorProfileId: actor.profileId,
        eventType: "document_added",
        fromStatus: request.status,
        toStatus: request.status,
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
          FINANCE_REQUEST_DOCUMENTS_BUCKET,
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

  /**
   * Hard-remove an active document from a DRAFT request (metadata + storage).
   */
  async removeDraftRequestDocument(
    actor: FinancialRequestActorContext,
    input: { requestId: string; documentId: string }
  ): Promise<{ removedDocumentId: string }> {
    const request = await this.reload(input.requestId);
    await this.assertRequesterCanMutateDocuments(actor, request);
    if (request.status !== "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Only draft documents may be removed; use supersession after submission."
      );
    }

    const document = await this.repo.getDocument(input.documentId);
    if (!document || document.requestId !== request.id) {
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

    try {
      await this.repo.appendRequestEvent({
        requestId: request.id,
        actorProfileId: actor.profileId,
        eventType: "document_removed",
        fromStatus: request.status,
        toStatus: request.status,
        metadata: {
          documentId: document.id,
          documentRole: document.documentRole,
          filename: document.filename,
        },
      });
    } catch (eventError) {
      const msg =
        eventError instanceof Error ? eventError.message : String(eventError);
      if (/document_removed|check constraint|finance_request_events_type_check/i.test(msg)) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "Draft document was removed but document_removed events require the Slice 4 storage migration to be applied."
        );
      }
      throw eventError instanceof ActionError
        ? eventError
        : new ActionError("INTERNAL_ERROR", msg);
    }

    return { removedDocumentId: document.id };
  }

  /**
   * Post-submission (or non-draft) supersession: keep history, replace active bytes.
   */
  async supersedeRequestDocument(
    actor: FinancialRequestActorContext,
    input: {
      requestId: string;
      documentId: string;
      filename: string;
      declaredMimeType?: string | null;
      bytes: Buffer;
      documentRole?: FinancialRequestDocumentRole;
    }
  ): Promise<{
    previous: FinancialRequestDocument;
    replacement: FinancialRequestDocument;
  }> {
    let validated;
    try {
      validated = validateFinanceRequestDocumentFile({
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

    const request = await this.reload(input.requestId);
    await this.assertRequesterCanMutateDocuments(actor, request);
    if (request.status === "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Use removeDraftRequestDocument for draft documents."
      );
    }
    const terminal: FinancialRequestStatus[] = [
      "approved",
      "partially_approved",
      "rejected",
    ];
    if (terminal.includes(request.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Documents cannot be changed after a final decision."
      );
    }

    const previous = await this.repo.getDocument(input.documentId);
    if (!previous || previous.requestId !== request.id) {
      throw new ActionError("VALIDATION_ERROR", "Document not found.");
    }
    if (previous.supersededAt) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Document is already superseded."
      );
    }

    const role =
      input.documentRole ?? previous.documentRole;
    if (!isFinanceRequestDocumentRole(role)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid document role.");
    }

    const replacementId = newFinanceRequestDocumentId();
    const storagePath = buildFinanceRequestDocumentStoragePath({
      organisationId: request.organisationId,
      companyId: request.companyId,
      requestId: request.id,
      documentId: replacementId,
      filename: validated.filename,
    });

    await this.uploadStorageObject({
      bucket: FINANCE_REQUEST_DOCUMENTS_BUCKET,
      path: storagePath,
      bytes: validated.bytes,
      mimeType: validated.mimeType,
    });

    let replacement: FinancialRequestDocument;
    let superseded: FinancialRequestDocument;
    try {
      replacement = await this.repo.insertDocumentMetadata({
        id: replacementId,
        requestId: request.id,
        uploadedByProfileId: actor.profileId,
        filename: validated.filename,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        storageBucket: FINANCE_REQUEST_DOCUMENTS_BUCKET,
        storagePath,
        documentRole: role,
        checksum: validated.checksum,
      });
      superseded = await this.repo.markDocumentSuperseded({
        documentId: previous.id,
        supersededByDocumentId: replacement.id,
        supersededAt: new Date().toISOString(),
      });
      await this.repo.appendRequestEvent({
        requestId: request.id,
        actorProfileId: actor.profileId,
        eventType: "document_superseded",
        fromStatus: request.status,
        toStatus: request.status,
        metadata: {
          previousDocumentId: previous.id,
          replacementDocumentId: replacement.id,
          documentRole: role,
          filename: replacement.filename,
        },
      });
      await this.repo.appendRequestEvent({
        requestId: request.id,
        actorProfileId: actor.profileId,
        eventType: "document_added",
        fromStatus: request.status,
        toStatus: request.status,
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
        // Clear supersession markers if partially applied.
        await createAdminClient()
          .from("finance_request_documents")
          .update({
            superseded_at: null,
            superseded_by_document_id: null,
          })
          .eq("id", previous.id)
          .eq("organisation_id", this.organisationId);
        await this.repo.deleteDocumentMetadata(replacementId).catch(() => undefined);
        await this.removeStorageObject(
          FINANCE_REQUEST_DOCUMENTS_BUCKET,
          storagePath
        );
      } catch (cleanupError) {
        const msg =
          error instanceof Error ? error.message : "supersession failure";
        if (/document_superseded|type_check/i.test(msg)) {
          throw new ActionError(
            "INTERNAL_ERROR",
            "Supersession requires the Slice 4 storage migration (document_superseded event). Cleanup also failed: " +
              (cleanupError instanceof Error
                ? cleanupError.message
                : "unknown")
          );
        }
        throw new ActionError(
          "INTERNAL_ERROR",
          `Supersession failed and cleanup also failed (${
            cleanupError instanceof Error
              ? cleanupError.message
              : "unknown cleanup error"
          }). Original: ${msg}`
        );
      }
      const msg = error instanceof Error ? error.message : "Failed to supersede document.";
      if (/document_superseded|type_check/i.test(msg)) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "Supersession requires the Slice 4 storage migration to be applied (document_superseded event type)."
        );
      }
      if (error instanceof ActionError) throw error;
      throw new ActionError("INTERNAL_ERROR", msg);
    }

    return { previous: superseded, replacement };
  }

  /**
   * Authorized short-lived signed URL — never a permanent public URL.
   */
  async getRequestDocumentSignedUrl(
    actor: FinancialRequestActorContext,
    input: { requestId: string; documentId: string }
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    const request = await this.getRequest(actor, input.requestId);
    const document = await this.repo.getDocument(input.documentId);
    if (!document || document.requestId !== request.id) {
      throw new ActionError("VALIDATION_ERROR", "Document not found.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(document.storageBucket)
      .createSignedUrl(
        document.storagePath,
        FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS
      );
    if (error || !data?.signedUrl) {
      throw new ActionError(
        "INTERNAL_ERROR",
        error?.message ?? "Failed to create signed document URL."
      );
    }
    return {
      signedUrl: data.signedUrl,
      expiresInSeconds: FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS,
    };
  }

  /** Exposed for verification / later slices — not an HTTP surface. */
  get repository(): PlatformFinanceRequestsRepository {
    return this.repo;
  }
}
