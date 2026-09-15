import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import {
  FINANCIAL_REQUEST_CAPABILITIES,
  FINANCIAL_REQUEST_PAYEE_TYPES,
  type FinancialRequestPayeeType,
} from "@/modules/platform-finance/domain/requests";
import {
  requirePlatformFinanceAccess,
  requirePlatformFinanceAccessAny,
} from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceRequestsServerService } from "@/modules/platform-finance/server/PlatformFinanceRequestsServerService";

type FinancialRequestApiAction =
  | "getRequest"
  | "listMyRequests"
  | "listReviewQueue"
  | "listApprovalQueue"
  | "createRequest"
  | "updateDraftRequest"
  | "submitRequest"
  | "startRequestReview"
  | "queryRequest"
  | "resubmitRequest"
  | "sendRequestToCeo"
  | "approveRequest"
  | "partiallyApproveRequest"
  | "rejectRequest";

type RequestBody = {
  action?: FinancialRequestApiAction;
  id?: string;
  companyId?: string;
  input?: Record<string, unknown>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value;
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function requireUuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw Object.assign(new Error(`${field} must be a valid UUID.`), {
      statusHint: 400,
    });
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error(`${field} is required.`), {
      statusHint: 400,
    });
  }
  return value.trim();
}

function requirePayeeType(value: unknown): FinancialRequestPayeeType {
  if (
    typeof value !== "string" ||
    !(FINANCIAL_REQUEST_PAYEE_TYPES as readonly string[]).includes(value)
  ) {
    throw Object.assign(new Error("payeeType is invalid."), {
      statusHint: 400,
    });
  }
  return value as FinancialRequestPayeeType;
}

function sanitizeClientMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Financial request operation failed.";
  // Strip RPC function prefixes / SQL noise from client payloads.
  return trimmed
    .replace(/^finance_request_[a-z_]+:\s*/i, "")
    .replace(/\b(sqlstate|postgres|plpgsql)\b/gi, "")
    .trim()
    .slice(0, 280);
}

function actionErrorStatus(code: string, message: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (
    code === "MODULE_NOT_ENABLED" ||
    code === "FORBIDDEN" ||
    code === "ORGANISATION_NOT_FOUND" ||
    code === "ORGANISATION_INACTIVE" ||
    code === "PROFILE_NOT_FOUND"
  ) {
    return 403;
  }
  if (code === "VALIDATION_ERROR") {
    const lower = message.toLowerCase();
    if (
      /invalid status|may only query|already|competing|no longer|race/i.test(
        lower
      )
    ) {
      return 409;
    }
    if (/not found/i.test(lower)) {
      return 404;
    }
    return 422;
  }
  return 500;
}

function errorResponse(error: unknown) {
  if (isActionError(error)) {
    const message = sanitizeClientMessage(error.message);
    return NextResponse.json(
      { success: false, code: error.code, message },
      { status: actionErrorStatus(error.code, error.message) }
    );
  }

  if (
    error &&
    typeof error === "object" &&
    "statusHint" in error &&
    typeof (error as { statusHint?: unknown }).statusHint === "number"
  ) {
    const message = sanitizeClientMessage(
      error instanceof Error ? error.message : "Invalid request."
    );
    return NextResponse.json(
      { success: false, message },
      { status: (error as { statusHint: number }).statusHint }
    );
  }

  const raw =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Financial request operation failed.";
  // Outside a Next.js request (e.g. scripted handler checks) there is no
  // cookie/session context — treat as unauthenticated, not a server fault.
  if (
    /cookies.*outside a request scope|next-dynamic-api-wrong-context/i.test(raw)
  ) {
    return NextResponse.json(
      {
        success: false,
        code: "UNAUTHENTICATED",
        message: "You must be signed in to perform this action.",
      },
      { status: 401 }
    );
  }
  const message = sanitizeClientMessage(raw);
  const lower = message.toLowerCase();
  const status = /invalid status|may only query/i.test(lower)
    ? 409
    : /not found/i.test(lower)
      ? 404
      : /required|invalid|uuid|payee/i.test(lower)
        ? 400
        : 500;
  return NextResponse.json({ success: false, message }, { status });
}

function actorFrom(access: {
  organisationId: string;
  profileId: string;
}) {
  return {
    organisationId: access.organisationId,
    profileId: access.profileId,
  };
}

async function gateExistingRequest(
  capability: (typeof FINANCIAL_REQUEST_CAPABILITIES)[keyof typeof FINANCIAL_REQUEST_CAPABILITIES],
  requestId: string
) {
  const preliminary = await requirePlatformFinanceAccess({ capability });
  const service = new PlatformFinanceRequestsServerService(
    preliminary.organisationId
  );
  const existing = await service.repository.getRequest(requestId);
  if (!existing) {
    // Do not leak existence across orgs.
    throw Object.assign(new Error("Financial request not found."), {
      statusHint: 404,
    });
  }
  const access = await requirePlatformFinanceAccess({
    capability,
    companyId: existing.companyId,
  });
  return {
    access,
    service: new PlatformFinanceRequestsServerService(access.organisationId),
    existing,
  };
}

/** GET → list my requests (session-derived requester). */
export async function GET() {
  try {
    const access = await requirePlatformFinanceAccessAny({
      capabilities: [
        FINANCIAL_REQUEST_CAPABILITIES.create,
        FINANCIAL_REQUEST_CAPABILITIES.view_own,
      ],
    });
    const service = new PlatformFinanceRequestsServerService(
      access.organisationId
    );
    const data = await service.listMyRequests(actorFrom(access));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const action = body.action;
    if (!action) {
      return NextResponse.json(
        { success: false, message: "Missing action." },
        { status: 400 }
      );
    }

    const input = body.input ?? {};

    switch (action) {
      case "listMyRequests": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCIAL_REQUEST_CAPABILITIES.create,
            FINANCIAL_REQUEST_CAPABILITIES.view_own,
          ],
        });
        const service = new PlatformFinanceRequestsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listMyRequests(actorFrom(access)),
        });
      }

      case "listReviewQueue": {
        const access = await requirePlatformFinanceAccess({
          capability: FINANCIAL_REQUEST_CAPABILITIES.review,
        });
        const service = new PlatformFinanceRequestsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listReviewQueue(actorFrom(access)),
        });
      }

      case "listApprovalQueue": {
        const access = await requirePlatformFinanceAccess({
          capability: FINANCIAL_REQUEST_CAPABILITIES.approve,
        });
        const service = new PlatformFinanceRequestsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listApprovalQueue(actorFrom(access)),
        });
      }

      case "getRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCIAL_REQUEST_CAPABILITIES.create,
            FINANCIAL_REQUEST_CAPABILITIES.view_own,
            FINANCIAL_REQUEST_CAPABILITIES.review,
            FINANCIAL_REQUEST_CAPABILITIES.approve,
          ],
        });
        const service = new PlatformFinanceRequestsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getRequest(actorFrom(access), requestId),
        });
      }

      case "createRequest": {
        // Auth before field validation so unauthenticated callers get 401, not 400.
        await requirePlatformFinanceAccess({
          capability: FINANCIAL_REQUEST_CAPABILITIES.create,
        });
        const companyId = requireUuid(
          input.companyId ?? body.companyId,
          "companyId"
        );
        const categoryId = requireUuid(input.categoryId, "categoryId");
        const requestedAmount = asOptionalNumber(input.requestedAmount);
        if (requestedAmount == null || requestedAmount < 0) {
          return NextResponse.json(
            {
              success: false,
              message: "requestedAmount must be a non-negative number.",
            },
            { status: 400 }
          );
        }
        const purpose = requireNonEmptyString(input.purpose, "purpose");
        const payeeName = requireNonEmptyString(input.payeeName, "payeeName");
        const payeeType = requirePayeeType(input.payeeType);
        const access = await requirePlatformFinanceAccess({
          capability: FINANCIAL_REQUEST_CAPABILITIES.create,
          companyId,
        });
        const service = new PlatformFinanceRequestsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.createRequest(actorFrom(access), {
            companyId,
            categoryId,
            requestedAmount,
            purpose,
            description: asOptionalString(input.description) ?? null,
            payeeName,
            payeeType,
            requiredByDate: asOptionalString(input.requiredByDate) ?? null,
            externalReference:
              asOptionalString(input.externalReference) ?? null,
            projectContractRef:
              asOptionalString(input.projectContractRef) ?? null,
            currency:
              typeof input.currency === "string" ? input.currency : undefined,
          }),
        });
      }

      case "updateDraftRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.create,
          requestId
        );
        const requestedAmount = asOptionalNumber(input.requestedAmount);
        if (
          input.requestedAmount !== undefined &&
          input.requestedAmount !== null &&
          (requestedAmount == null || requestedAmount < 0)
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "requestedAmount must be a non-negative number.",
            },
            { status: 400 }
          );
        }
        const payeeTypeRaw = input.payeeType;
        const payeeType =
          payeeTypeRaw === undefined || payeeTypeRaw === null
            ? undefined
            : requirePayeeType(payeeTypeRaw);
        return NextResponse.json({
          success: true,
          data: await service.updateDraftRequest(
            actorFrom(access),
            requestId,
            {
              categoryId:
                input.categoryId === undefined
                  ? undefined
                  : input.categoryId === null
                    ? null
                    : requireUuid(input.categoryId, "categoryId"),
              requestedAmount,
              purpose: asOptionalString(input.purpose),
              description: asOptionalString(input.description),
              payeeName: asOptionalString(input.payeeName),
              payeeType: payeeType ?? null,
              requiredByDate: asOptionalString(input.requiredByDate),
              clearRequiredByDate: Boolean(input.clearRequiredByDate),
              externalReference: asOptionalString(input.externalReference),
              projectContractRef: asOptionalString(input.projectContractRef),
            }
          ),
        });
      }

      case "submitRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.create,
          requestId
        );
        return NextResponse.json({
          success: true,
          data: await service.submitRequest(actorFrom(access), requestId),
        });
      }

      case "startRequestReview": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.review,
          requestId
        );
        return NextResponse.json({
          success: true,
          data: await service.startRequestReview(
            actorFrom(access),
            requestId
          ),
        });
      }

      case "queryRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const reason = requireNonEmptyString(input.reason, "reason");
        const actorRole = input.actorRole;
        if (actorRole !== "finance" && actorRole !== "ceo") {
          return NextResponse.json(
            {
              success: false,
              message: 'actorRole must be "finance" or "ceo".',
            },
            { status: 400 }
          );
        }
        const capability =
          actorRole === "finance"
            ? FINANCIAL_REQUEST_CAPABILITIES.review
            : FINANCIAL_REQUEST_CAPABILITIES.approve;
        const { access, service } = await gateExistingRequest(
          capability,
          requestId
        );
        return NextResponse.json({
          success: true,
          data: await service.queryRequest(actorFrom(access), requestId, {
            reason,
            actorRole,
          }),
        });
      }

      case "resubmitRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.create,
          requestId
        );
        const requestedAmount = asOptionalNumber(input.requestedAmount);
        const payeeTypeRaw = input.payeeType;
        const payeeType =
          payeeTypeRaw === undefined || payeeTypeRaw === null
            ? undefined
            : requirePayeeType(payeeTypeRaw);
        return NextResponse.json({
          success: true,
          data: await service.resubmitRequest(actorFrom(access), requestId, {
            categoryId:
              input.categoryId === undefined
                ? undefined
                : input.categoryId === null
                  ? null
                  : requireUuid(input.categoryId, "categoryId"),
            requestedAmount,
            purpose: asOptionalString(input.purpose),
            description: asOptionalString(input.description),
            payeeName: asOptionalString(input.payeeName),
            payeeType: payeeType ?? null,
            requiredByDate: asOptionalString(input.requiredByDate),
            clearRequiredByDate: Boolean(input.clearRequiredByDate),
            externalReference: asOptionalString(input.externalReference),
            projectContractRef: asOptionalString(input.projectContractRef),
          }),
        });
      }

      case "sendRequestToCeo": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.review,
          requestId
        );
        return NextResponse.json({
          success: true,
          data: await service.sendRequestToCeo(
            actorFrom(access),
            requestId,
            asOptionalString(input.financeNotes) ?? null
          ),
        });
      }

      case "approveRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.approve,
          requestId
        );
        return NextResponse.json({
          success: true,
          data: await service.approveRequest(
            actorFrom(access),
            requestId,
            asOptionalString(input.decisionNotes) ?? null
          ),
        });
      }

      case "partiallyApproveRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const approvedAmount = asOptionalNumber(input.approvedAmount);
        if (approvedAmount == null) {
          return NextResponse.json(
            { success: false, message: "approvedAmount is required." },
            { status: 400 }
          );
        }
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.approve,
          requestId
        );
        return NextResponse.json({
          success: true,
          data: await service.partiallyApproveRequest(
            actorFrom(access),
            requestId,
            {
              approvedAmount,
              decisionNotes: asOptionalString(input.decisionNotes) ?? null,
            }
          ),
        });
      }

      case "rejectRequest": {
        const requestId = requireUuid(body.id ?? input.requestId, "id");
        const reason = requireNonEmptyString(input.reason, "reason");
        const { access, service } = await gateExistingRequest(
          FINANCIAL_REQUEST_CAPABILITIES.approve,
          requestId
        );
        return NextResponse.json({
          success: true,
          data: await service.rejectRequest(
            actorFrom(access),
            requestId,
            reason
          ),
        });
      }

      default:
        return NextResponse.json(
          { success: false, message: `Unknown action: ${String(action)}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return errorResponse(error);
  }
}
