import { ActionError, toActionError } from "@/lib/actions/errors";
import {
  FINANCIAL_REQUEST_CAPABILITIES,
  FINANCIAL_REQUEST_PAYEE_TYPES,
  type FinancialRequest,
  type FinancialRequestPayeeType,
} from "@/modules/platform-finance/domain/requests";
import { PlatformFinanceRequestsRepository } from "@/modules/platform-finance/server/PlatformFinanceRequestsRepository";
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
      const id = await rpcUpdateDraftFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        ...input,
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
    } = {}
  ): Promise<FinancialRequest> {
    if (input.payeeType != null) assertPayeeType(input.payeeType);
    try {
      const id = await rpcResubmitFinancialRequest({
        actorProfileId: actor.profileId,
        requestId,
        ...input,
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

  /** Exposed for verification / later slices — not an HTTP surface. */
  get repository(): PlatformFinanceRequestsRepository {
    return this.repo;
  }
}
