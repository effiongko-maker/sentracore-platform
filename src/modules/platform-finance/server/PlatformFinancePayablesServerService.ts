/**
 * Platform Finance Payables — server service (Slice 3 + Slice 4 documents).
 * Callers must gate with requirePlatformFinanceAccess before mutations.
 * Lifecycle writes use named RPCs; document bytes use private Storage.
 *
 * Payables are never created here. Since the Vendor Bill domain exists, every
 * obligation originates from an approval decision on its upstream record
 * (Vendor Bill or Financial Request), and createPayable refuses outright.
 */
import { ActionError, toActionError } from "@/lib/actions/errors";
import {
  FINANCE_PAYABLE_CAPABILITIES,
  FINANCE_PAYABLE_PAYEE_TYPES,
  PLATFORM_FINANCE_CAPABILITIES,
  type FinancePayablePayeeType,
  type FinancePayableStatus,
} from "@/modules/platform-finance/types";
import {
  PlatformFinancePayablesRepository,
  type FinancePayableView,
} from "@/modules/platform-finance/server/PlatformFinancePayablesRepository";
import {
  buildFinancePayableDocumentStoragePath,
  FINANCE_PAYABLE_DOCUMENTS_BUCKET,
  FINANCE_PAYABLE_DOCUMENT_SIGNED_URL_SECONDS,
  isFinancePayableDocumentRole,
  newFinancePayableDocumentId,
  validateFinancePayableDocumentFile,
} from "@/modules/platform-finance/server/payableDocumentStorage";
import {
  rpcApproveFinancePayable,
  rpcCancelFinancePayable,
  rpcPartiallyApproveFinancePayable,
  rpcQueryFinancePayable,
  rpcRejectFinancePayable,
  rpcStartFinancePayableReview,
  rpcSubmitFinancePayable,
  rpcUpdateFinancePayableDraft,
} from "@/modules/platform-finance/server/payableTransitions";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  FinancePayableDocument,
  FinancePayableDocumentRole,
  FinancePayableEvent,
  FinancePayableSourceRequestSummary,
} from "@/modules/platform-finance/domain/payables";

export type FinancePayableActorContext = {
  organisationId: string;
  profileId: string;
};

export type FinancePayableDetail = {
  payable: FinancePayableView;
  events: FinancePayableEvent[];
  documents: FinancePayableDocument[];
  sourceRequest: FinancePayableSourceRequestSummary | null;
};

function mapRpcError(error: unknown): never {
  const mapped = toActionError(error);
  const message = mapped.message.toLowerCase();
  if (
    message.includes("separation of duties") ||
    message.includes("missing capability") ||
    message.includes("no company access") ||
    message.includes("only the creator")
  ) {
    throw new ActionError("FORBIDDEN", mapped.message, { cause: error });
  }
  if (
    message.includes("not found") ||
    message.includes("invalid status") ||
    message.includes("required") ||
    message.includes("payable_amount") ||
    message.includes("approved_amount") ||
    message.includes("already exists") ||
    message.includes("request-originated") ||
    message.includes("only draft") ||
    message.includes("must satisfy")
  ) {
    throw new ActionError("VALIDATION_ERROR", mapped.message, { cause: error });
  }
  throw mapped;
}

function assertPayeeType(value: string): asserts value is FinancePayablePayeeType {
  if (!(FINANCE_PAYABLE_PAYEE_TYPES as readonly string[]).includes(value)) {
    throw new ActionError("VALIDATION_ERROR", "Invalid payee type.");
  }
}

export class PlatformFinancePayablesServerService {
  private readonly repo: PlatformFinancePayablesRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinancePayablesRepository(organisationId);
  }

  get repository(): PlatformFinancePayablesRepository {
    return this.repo;
  }

  private async reload(payableId: string): Promise<FinancePayableView> {
    const payable = await this.repo.getPayable(payableId);
    if (!payable) {
      throw new ActionError("VALIDATION_ERROR", "Finance payable not found.");
    }
    return payable;
  }

  private async assertCanView(
    actor: FinancePayableActorContext,
    payable: FinancePayableView
  ): Promise<void> {
    if (payable.organisationId !== actor.organisationId) {
      throw new ActionError("FORBIDDEN", "Finance payable not found.");
    }

    const admin = createAdminClient();
    const isOwner = payable.createdByProfileId === actor.profileId;

    if (isOwner) {
      const { data: ownCap } = await admin
        .from("finance_capability_grants")
        .select("id")
        .eq("organisation_id", actor.organisationId)
        .eq("profile_id", actor.profileId)
        .in("capability", [
          FINANCE_PAYABLE_CAPABILITIES.create,
          FINANCE_PAYABLE_CAPABILITIES.view,
          PLATFORM_FINANCE_CAPABILITIES.view,
        ])
        .limit(1)
        .maybeSingle();
      if (ownCap) return;
    }

    const { data: access } = await admin
      .from("finance_company_access")
      .select("id")
      .eq("company_id", payable.companyId)
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (!access) {
      throw new ActionError("FORBIDDEN", "Finance payable not found.");
    }

    const { data: staffCap } = await admin
      .from("finance_capability_grants")
      .select("id")
      .eq("organisation_id", actor.organisationId)
      .eq("profile_id", actor.profileId)
      .in("capability", [
        FINANCE_PAYABLE_CAPABILITIES.view,
        FINANCE_PAYABLE_CAPABILITIES.review,
        FINANCE_PAYABLE_CAPABILITIES.approve,
        PLATFORM_FINANCE_CAPABILITIES.view,
      ])
      .limit(1)
      .maybeSingle();
    if (!staffCap) {
      throw new ActionError("FORBIDDEN", "Finance payable not found.");
    }
  }

  async getPayable(
    actor: FinancePayableActorContext,
    payableId: string
  ): Promise<FinancePayableView> {
    const payable = await this.repo.getPayable(payableId);
    if (!payable) {
      throw new ActionError("VALIDATION_ERROR", "Finance payable not found.");
    }
    await this.assertCanView(actor, payable);
    return payable;
  }

  async getPayableDetail(
    actor: FinancePayableActorContext,
    payableId: string
  ): Promise<FinancePayableDetail> {
    const payable = await this.getPayable(actor, payableId);
    const [events, documents, sourceRequest] = await Promise.all([
      this.repo.listPayableEvents(payableId),
      this.repo.listPayableDocuments(payableId),
      this.repo.getSourceRequestSummary(payable.sourceType, payable.sourceId),
    ]);
    return { payable, events, documents, sourceRequest };
  }

  async listMyPayables(
    actor: FinancePayableActorContext
  ): Promise<FinancePayableView[]> {
    return this.repo.listMyPayables(actor.profileId);
  }

  /**
   * Register collection: payables for accessible companies ∪ own payables.
   */
  async listAccessiblePayables(
    actor: FinancePayableActorContext
  ): Promise<FinancePayableView[]> {
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    const [byCompany, mine] = await Promise.all([
      this.repo.listPayablesForCompanies(companyIds),
      this.repo.listMyPayables(actor.profileId),
    ]);
    const byId = new Map<string, FinancePayableView>();
    for (const row of [...byCompany, ...mine]) {
      byId.set(row.id, row);
    }
    return [...byId.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    );
  }

  /** Organisation-wide executive projection, independently grant-checked. */
  async listCommandCentrePayables(profileId: string): Promise<FinancePayableView[]> {
    const admin = createAdminClient();
    const { data: grant, error } = await admin
      .from("platform_capability_grants")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .eq("capability", "platform.command_centre.view")
      .maybeSingle();
    if (error || !grant) {
      throw new ActionError("FORBIDDEN", "Executive Office composition is not authorised.");
    }
    const { data: companies, error: companiesError } = await admin
      .from("finance_companies")
      .select("id")
      .eq("organisation_id", this.organisationId);
    if (companiesError) {
      throw new ActionError("INTERNAL_ERROR", "Unable to compose Finance payables.");
    }
    return this.repo.listPayablesForCompanies(
      (companies ?? []).map((company) => String(company.id))
    );
  }

  async listAccessibleCompanies(
    actor: FinancePayableActorContext
  ): Promise<Array<{ id: string; code: string; name: string; status: string }>> {
    return this.repo.listAccessibleCompanies(actor.profileId);
  }

  async getMyPayableCapabilities(
    actor: FinancePayableActorContext
  ): Promise<{
    profileId: string;
    view: boolean;
    create: boolean;
    review: boolean;
    approve: boolean;
    platformView: boolean;
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
      view: granted.has(FINANCE_PAYABLE_CAPABILITIES.view),
      create: granted.has(FINANCE_PAYABLE_CAPABILITIES.create),
      review: granted.has(FINANCE_PAYABLE_CAPABILITIES.review),
      approve: granted.has(FINANCE_PAYABLE_CAPABILITIES.approve),
      platformView: granted.has(PLATFORM_FINANCE_CAPABILITIES.view),
    };
  }

  /**
   * Direct payable creation is permanently closed.
   *
   * A Payable is only ever the product of an approval decision:
   *   vendor_bill       → finance_vendor_bill_approve / _partially_approve
   *   financial_request → finance_request_approve / _partially_approve
   * Both mint the obligation inside the approval transaction. The signature is
   * retained so any remaining caller fails loudly instead of bypassing
   * Vendor Bill → Finance review → CEO approval.
   */
  async createPayable(
    _actor: FinancePayableActorContext,
    _input: {
      companyId: string;
      payeeName: string;
      payeeType: FinancePayablePayeeType;
      payableAmount: number;
      sourceId: string;
      currency?: string;
      description?: string | null;
      dueDate?: string | null;
      projectContractRef?: string | null;
    }
  ): Promise<never> {
    throw new ActionError(
      "FORBIDDEN",
      "Direct payable creation is not permitted. Raise a Vendor Bill, have Finance review it, and obtain CEO approval — the payable is created automatically on approval."
    );
  }

  async updateDraftPayable(
    actor: FinancePayableActorContext,
    payableId: string,
    input: {
      payeeName?: string | null;
      payeeType?: FinancePayablePayeeType | null;
      payableAmount?: number | null;
      description?: string | null;
      dueDate?: string | null;
      clearDueDate?: boolean;
      projectContractRef?: string | null;
      currency?: string | null;
    }
  ): Promise<FinancePayableView> {
    if (input.payeeType != null) assertPayeeType(input.payeeType);
    if (
      input.payableAmount !== undefined &&
      input.payableAmount !== null &&
      (typeof input.payableAmount !== "number" ||
        !Number.isFinite(input.payableAmount) ||
        input.payableAmount <= 0)
    ) {
      throw new ActionError("VALIDATION_ERROR", "payableAmount must be > 0.");
    }
    try {
      await rpcUpdateFinancePayableDraft({
        actorProfileId: actor.profileId,
        payableId,
        payeeName: input.payeeName,
        payeeType: input.payeeType,
        payableAmount: input.payableAmount,
        description: input.description,
        dueDate: input.dueDate,
        clearDueDate: input.clearDueDate,
        projectContractRef: input.projectContractRef,
        currency: input.currency,
      });
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  async submitPayable(
    actor: FinancePayableActorContext,
    payableId: string
  ): Promise<FinancePayableView> {
    try {
      await rpcSubmitFinancePayable(actor.profileId, payableId);
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  async startReview(
    actor: FinancePayableActorContext,
    payableId: string
  ): Promise<FinancePayableView> {
    try {
      await rpcStartFinancePayableReview(actor.profileId, payableId);
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  async approvePayable(
    actor: FinancePayableActorContext,
    payableId: string,
    decisionNotes?: string | null
  ): Promise<FinancePayableView> {
    try {
      await rpcApproveFinancePayable(actor.profileId, payableId, decisionNotes);
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  async partiallyApprovePayable(
    actor: FinancePayableActorContext,
    payableId: string,
    approvedAmount: number,
    decisionNotes?: string | null
  ): Promise<FinancePayableView> {
    if (
      typeof approvedAmount !== "number" ||
      !Number.isFinite(approvedAmount) ||
      approvedAmount <= 0
    ) {
      throw new ActionError("VALIDATION_ERROR", "approvedAmount must be > 0.");
    }
    try {
      await rpcPartiallyApproveFinancePayable(
        actor.profileId,
        payableId,
        approvedAmount,
        decisionNotes
      );
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  async rejectPayable(
    actor: FinancePayableActorContext,
    payableId: string,
    reason: string
  ): Promise<FinancePayableView> {
    if (!reason?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "Rejection reason is required.");
    }
    try {
      await rpcRejectFinancePayable(actor.profileId, payableId, reason.trim());
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  async queryPayable(
    actor: FinancePayableActorContext,
    payableId: string,
    reason: string
  ): Promise<FinancePayableView> {
    if (!reason?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "Query reason is required.");
    }
    try {
      await rpcQueryFinancePayable(actor.profileId, payableId, reason.trim());
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  async cancelPayable(
    actor: FinancePayableActorContext,
    payableId: string,
    reason?: string | null
  ): Promise<FinancePayableView> {
    try {
      await rpcCancelFinancePayable(actor.profileId, payableId, reason);
    } catch (error) {
      mapRpcError(error);
    }
    return this.reload(payableId);
  }

  private async assertCreatorCanMutateDocuments(
    actor: FinancePayableActorContext,
    payable: FinancePayableView
  ): Promise<void> {
    if (payable.organisationId !== actor.organisationId) {
      throw new ActionError("FORBIDDEN", "Finance payable not found.");
    }
    if (payable.createdByProfileId !== actor.profileId) {
      throw new ActionError(
        "FORBIDDEN",
        "Only the creator may manage documents on this payable."
      );
    }
    const caps = await this.getMyPayableCapabilities(actor);
    if (!caps.create) {
      throw new ActionError(
        "FORBIDDEN",
        "Missing capability platform_finance.payable.create."
      );
    }
    const companyIds = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!companyIds.includes(payable.companyId)) {
      throw new ActionError("FORBIDDEN", "No company access for this payable.");
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
          `Storage bucket ${input.bucket} is not configured. Apply finance payable documents storage migration.`
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
   * Uses existing domain event name document_added (not document_uploaded).
   */
  async uploadDocument(
    actor: FinancePayableActorContext,
    input: {
      payableId: string;
      documentRole: FinancePayableDocumentRole;
      filename: string;
      declaredMimeType?: string | null;
      bytes: Buffer;
    }
  ): Promise<FinancePayableDocument> {
    if (!isFinancePayableDocumentRole(input.documentRole)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid document role.");
    }

    let validated;
    try {
      validated = validateFinancePayableDocumentFile({
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

    const payable = await this.reload(input.payableId);
    await this.assertCreatorCanMutateDocuments(actor, payable);

    const uploadable: FinancePayableStatus[] = ["draft", "pending_approval"];
    if (!uploadable.includes(payable.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Documents can only be added while the payable is draft or pending_approval."
      );
    }

    const documentId = newFinancePayableDocumentId();
    const storagePath = buildFinancePayableDocumentStoragePath({
      organisationId: payable.organisationId,
      companyId: payable.companyId,
      payableId: payable.id,
      documentId,
      filename: validated.filename,
    });

    await this.uploadStorageObject({
      bucket: FINANCE_PAYABLE_DOCUMENTS_BUCKET,
      path: storagePath,
      bytes: validated.bytes,
      mimeType: validated.mimeType,
    });

    let document: FinancePayableDocument;
    try {
      document = await this.repo.insertDocumentMetadata({
        id: documentId,
        payableId: payable.id,
        uploadedByProfileId: actor.profileId,
        filename: validated.filename,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        storageBucket: FINANCE_PAYABLE_DOCUMENTS_BUCKET,
        storagePath,
        documentRole: input.documentRole,
        checksum: validated.checksum,
      });
      await this.repo.appendPayableEvent({
        payableId: payable.id,
        actorProfileId: actor.profileId,
        eventType: "document_added",
        fromStatus: payable.status,
        toStatus: payable.status,
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
          FINANCE_PAYABLE_DOCUMENTS_BUCKET,
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
   * Hard-remove an active document from a DRAFT payable (metadata + storage).
   */
  async removeDocument(
    actor: FinancePayableActorContext,
    input: { payableId: string; documentId: string }
  ): Promise<{ removedDocumentId: string }> {
    const payable = await this.reload(input.payableId);
    await this.assertCreatorCanMutateDocuments(actor, payable);
    if (payable.status !== "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Only draft documents may be removed; use supersession after submission."
      );
    }

    const document = await this.repo.getDocument(input.documentId);
    if (!document || document.payableId !== payable.id) {
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

    await this.repo.appendPayableEvent({
      payableId: payable.id,
      actorProfileId: actor.profileId,
      eventType: "document_removed",
      fromStatus: payable.status,
      toStatus: payable.status,
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
   * Blocked for draft (use remove) and terminal paid/rejected/cancelled.
   */
  async supersedeDocument(
    actor: FinancePayableActorContext,
    input: {
      payableId: string;
      documentId: string;
      filename: string;
      declaredMimeType?: string | null;
      bytes: Buffer;
      documentRole?: FinancePayableDocumentRole;
    }
  ): Promise<{
    previous: FinancePayableDocument;
    replacement: FinancePayableDocument;
  }> {
    let validated;
    try {
      validated = validateFinancePayableDocumentFile({
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

    const payable = await this.reload(input.payableId);
    await this.assertCreatorCanMutateDocuments(actor, payable);
    if (payable.status === "draft") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Use removeDocument for draft documents."
      );
    }
    const terminal: FinancePayableStatus[] = [
      "paid",
      "rejected",
      "cancelled",
    ];
    if (terminal.includes(payable.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Documents cannot be changed after the payable is paid, rejected, or cancelled."
      );
    }

    const previous = await this.repo.getDocument(input.documentId);
    if (!previous || previous.payableId !== payable.id) {
      throw new ActionError("VALIDATION_ERROR", "Document not found.");
    }
    if (previous.supersededAt) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Document is already superseded."
      );
    }

    const role = input.documentRole ?? previous.documentRole;
    if (!isFinancePayableDocumentRole(role)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid document role.");
    }

    const replacementId = newFinancePayableDocumentId();
    const storagePath = buildFinancePayableDocumentStoragePath({
      organisationId: payable.organisationId,
      companyId: payable.companyId,
      payableId: payable.id,
      documentId: replacementId,
      filename: validated.filename,
    });

    await this.uploadStorageObject({
      bucket: FINANCE_PAYABLE_DOCUMENTS_BUCKET,
      path: storagePath,
      bytes: validated.bytes,
      mimeType: validated.mimeType,
    });

    let replacement: FinancePayableDocument;
    let superseded: FinancePayableDocument;
    try {
      replacement = await this.repo.insertDocumentMetadata({
        id: replacementId,
        payableId: payable.id,
        uploadedByProfileId: actor.profileId,
        filename: validated.filename,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        storageBucket: FINANCE_PAYABLE_DOCUMENTS_BUCKET,
        storagePath,
        documentRole: role,
        checksum: validated.checksum,
      });
      superseded = await this.repo.markDocumentSuperseded({
        documentId: previous.id,
        supersededByDocumentId: replacement.id,
        supersededAt: new Date().toISOString(),
      });
      await this.repo.appendPayableEvent({
        payableId: payable.id,
        actorProfileId: actor.profileId,
        eventType: "document_superseded",
        fromStatus: payable.status,
        toStatus: payable.status,
        metadata: {
          previousDocumentId: previous.id,
          replacementDocumentId: replacement.id,
          documentRole: role,
          filename: replacement.filename,
        },
      });
      await this.repo.appendPayableEvent({
        payableId: payable.id,
        actorProfileId: actor.profileId,
        eventType: "document_added",
        fromStatus: payable.status,
        toStatus: payable.status,
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
          .from("finance_payable_documents")
          .update({
            superseded_at: null,
            superseded_by_document_id: null,
          })
          .eq("id", previous.id)
          .eq("organisation_id", this.organisationId);
        await this.repo.deleteDocumentMetadata(replacementId).catch(() => undefined);
        await this.removeStorageObject(
          FINANCE_PAYABLE_DOCUMENTS_BUCKET,
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
    actor: FinancePayableActorContext,
    input: { payableId: string; documentId: string }
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    const payable = await this.getPayable(actor, input.payableId);
    const document = await this.repo.getDocument(input.documentId);
    if (!document || document.payableId !== payable.id) {
      throw new ActionError("VALIDATION_ERROR", "Document not found.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(document.storageBucket)
      .createSignedUrl(
        document.storagePath,
        FINANCE_PAYABLE_DOCUMENT_SIGNED_URL_SECONDS
      );
    if (error || !data?.signedUrl) {
      throw new ActionError(
        "INTERNAL_ERROR",
        error?.message ?? "Failed to create signed document URL."
      );
    }
    return {
      signedUrl: data.signedUrl,
      expiresInSeconds: FINANCE_PAYABLE_DOCUMENT_SIGNED_URL_SECONDS,
    };
  }
}
