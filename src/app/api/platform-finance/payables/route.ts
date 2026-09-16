/**
 * Platform Finance Payables API — thin action dispatcher.
 * Business rules / SoD / company access live in RPCs + server service.
 *
 * This API cannot create a payable. Obligations originate upstream:
 * Vendor Bill → Finance review → CEO approval (/api/platform-finance/vendor-bills),
 * or Financial Request → CEO approval. The createPayable action is retained
 * only to refuse the bypass explicitly.
 *
 * No Banking, Payments, posting, or createPayableFromRequest.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import {
  FINANCE_PAYABLE_CAPABILITIES,
  FINANCE_PAYABLE_DOCUMENT_ROLES,
  FINANCE_PAYABLE_PAYEE_TYPES,
  PLATFORM_FINANCE_CAPABILITIES,
  type FinancePayableDocumentRole,
  type FinancePayablePayeeType,
} from "@/modules/platform-finance/types";
import {
  requirePlatformFinanceAccess,
  requirePlatformFinanceAccessAny,
} from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinancePayablesServerService } from "@/modules/platform-finance/server/PlatformFinancePayablesServerService";
import { isFinancePayableDocumentRole } from "@/modules/platform-finance/server/payableDocumentStorage";

type PayableApiAction =
  | "getPayable"
  | "getPayableDetail"
  | "listMyPayables"
  | "listAccessiblePayables"
  | "listAccessibleCompanies"
  | "getMyPayableCapabilities"
  | "createPayable"
  | "updateDraftPayable"
  | "submitPayable"
  | "startReview"
  | "approvePayable"
  | "partiallyApprovePayable"
  | "rejectPayable"
  | "queryPayable"
  | "cancelPayable"
  | "uploadDocument"
  | "removeDocument"
  | "supersedeDocument"
  | "getDocumentSignedUrl";

const REGISTER_READ_CAPABILITIES = [
  PLATFORM_FINANCE_CAPABILITIES.view,
  FINANCE_PAYABLE_CAPABILITIES.view,
  FINANCE_PAYABLE_CAPABILITIES.create,
  FINANCE_PAYABLE_CAPABILITIES.review,
  FINANCE_PAYABLE_CAPABILITIES.approve,
] as const;

type RequestBody = {
  action?: PayableApiAction;
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

function requirePayeeType(value: unknown): FinancePayablePayeeType {
  if (
    typeof value !== "string" ||
    !(FINANCE_PAYABLE_PAYEE_TYPES as readonly string[]).includes(value)
  ) {
    throw Object.assign(new Error("payeeType is invalid."), {
      statusHint: 400,
    });
  }
  return value as FinancePayablePayeeType;
}

function requireDocumentRole(value: unknown): FinancePayableDocumentRole {
  if (!isFinancePayableDocumentRole(value)) {
    throw Object.assign(
      new Error(
        `documentRole must be one of: ${FINANCE_PAYABLE_DOCUMENT_ROLES.join(", ")}.`
      ),
      { statusHint: 400 }
    );
  }
  return value;
}

function rejectClientStorageAuthority(input: Record<string, unknown>) {
  if (
    input.storagePath != null ||
    input.storage_path != null ||
    input.storageBucket != null ||
    input.storage_bucket != null ||
    input.bucket != null ||
    input.path != null
  ) {
    throw Object.assign(
      new Error("Client must not supply storage bucket or path."),
      { statusHint: 400 }
    );
  }
}

function decodeBase64File(contentBase64: unknown, field = "contentBase64"): Buffer {
  if (typeof contentBase64 !== "string" || !contentBase64.trim()) {
    throw Object.assign(new Error(`${field} is required.`), { statusHint: 400 });
  }
  const trimmed = contentBase64.trim();
  const raw = trimmed.includes(",")
    ? trimmed.slice(trimmed.indexOf(",") + 1)
    : trimmed;
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 0) {
      throw new Error("empty");
    }
    return buf;
  } catch {
    throw Object.assign(new Error(`${field} must be valid base64.`), {
      statusHint: 400,
    });
  }
}

function sanitizeClientMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Finance payable operation failed.";
  return trimmed
    .replace(/^finance_payable_[a-z_]+:\s*/i, "")
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
      /invalid status|already exists|duplicate|competing|no longer|race/i.test(
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
      : "Finance payable operation failed.";
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
  const status = /invalid status|already exists|duplicate/i.test(lower)
    ? 409
    : /not found/i.test(lower)
      ? 404
      : /required|invalid|uuid|payee|amount/i.test(lower)
        ? 400
        : 500;
  return NextResponse.json({ success: false, message }, { status });
}

function actorFrom(access: { organisationId: string; profileId: string }) {
  return {
    organisationId: access.organisationId,
    profileId: access.profileId,
  };
}

async function gateExistingPayable(
  capability: (typeof FINANCE_PAYABLE_CAPABILITIES)[keyof typeof FINANCE_PAYABLE_CAPABILITIES],
  payableId: string
) {
  const preliminary = await requirePlatformFinanceAccess({ capability });
  const service = new PlatformFinancePayablesServerService(
    preliminary.organisationId
  );
  const existing = await service.repository.getPayable(payableId);
  if (!existing) {
    throw Object.assign(new Error("Finance payable not found."), {
      statusHint: 404,
    });
  }
  const access = await requirePlatformFinanceAccess({
    capability,
    companyId: existing.companyId,
  });
  return {
    access,
    service: new PlatformFinancePayablesServerService(access.organisationId),
    existing,
  };
}

async function gateExistingPayableAny(
  capabilities: readonly (typeof FINANCE_PAYABLE_CAPABILITIES)[keyof typeof FINANCE_PAYABLE_CAPABILITIES][],
  payableId: string
) {
  const preliminary = await requirePlatformFinanceAccessAny({ capabilities });
  const service = new PlatformFinancePayablesServerService(
    preliminary.organisationId
  );
  const existing = await service.repository.getPayable(payableId);
  if (!existing) {
    throw Object.assign(new Error("Finance payable not found."), {
      statusHint: 404,
    });
  }
  const access = await requirePlatformFinanceAccessAny({
    capabilities,
    companyId: existing.companyId,
  });
  return {
    access,
    service: new PlatformFinancePayablesServerService(access.organisationId),
    existing,
  };
}

/** GET → list my payables (session-derived creator). */
export async function GET() {
  try {
    const access = await requirePlatformFinanceAccessAny({
      capabilities: [
        FINANCE_PAYABLE_CAPABILITIES.create,
        FINANCE_PAYABLE_CAPABILITIES.view,
      ],
    });
    const service = new PlatformFinancePayablesServerService(
      access.organisationId
    );
    const data = await service.listMyPayables(actorFrom(access));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return await handleMultipartDocumentPost(request);
    }

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
      case "listMyPayables": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCE_PAYABLE_CAPABILITIES.create,
            FINANCE_PAYABLE_CAPABILITIES.view,
          ],
        });
        const service = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listMyPayables(actorFrom(access)),
        });
      }

      case "listAccessiblePayables": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listAccessiblePayables(actorFrom(access)),
        });
      }

      case "listAccessibleCompanies": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCE_PAYABLE_CAPABILITIES.create,
            FINANCE_PAYABLE_CAPABILITIES.view,
            PLATFORM_FINANCE_CAPABILITIES.view,
          ],
        });
        const service = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listAccessibleCompanies(actorFrom(access)),
        });
      }

      case "getMyPayableCapabilities": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getMyPayableCapabilities(actorFrom(access)),
        });
      }

      case "getPayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getPayable(actorFrom(access), payableId),
        });
      }

      case "getPayableDetail": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getPayableDetail(actorFrom(access), payableId),
        });
      }

      case "createPayable": {
        // Auth before the refusal so unauthenticated callers still get 401.
        await requirePlatformFinanceAccess({
          capability: FINANCE_PAYABLE_CAPABILITIES.create,
        });
        // Payables are never minted through this API. vendor_bill obligations
        // require Vendor Bill → Finance review → CEO approval, and
        // financial_request obligations are created on CEO request approval.
        // The service method is deliberately not called.
        return NextResponse.json(
          {
            success: false,
            code: "FORBIDDEN",
            message:
              "Direct payable creation is not supported. vendor_bill payables require the Vendor Bill workflow with Finance review and CEO approval; Financial Request payables are created atomically on CEO approval.",
          },
          { status: 403 }
        );
      }

      case "updateDraftPayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.create,
          payableId
        );
        const payableAmount = asOptionalNumber(input.payableAmount);
        if (
          input.payableAmount !== undefined &&
          input.payableAmount !== null &&
          (payableAmount == null || payableAmount <= 0)
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "payableAmount must be a number greater than 0.",
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
          data: await service.updateDraftPayable(
            actorFrom(access),
            payableId,
            {
              payeeName: asOptionalString(input.payeeName),
              payeeType: payeeType ?? null,
              payableAmount,
              description: asOptionalString(input.description),
              dueDate: asOptionalString(input.dueDate),
              clearDueDate: Boolean(input.clearDueDate),
              projectContractRef: asOptionalString(input.projectContractRef),
              currency: asOptionalString(input.currency),
            }
          ),
        });
      }

      case "submitPayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.create,
          payableId
        );
        return NextResponse.json({
          success: true,
          data: await service.submitPayable(actorFrom(access), payableId),
        });
      }

      case "startReview": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.review,
          payableId
        );
        return NextResponse.json({
          success: true,
          data: await service.startReview(actorFrom(access), payableId),
        });
      }

      case "approvePayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.approve,
          payableId
        );
        return NextResponse.json({
          success: true,
          data: await service.approvePayable(
            actorFrom(access),
            payableId,
            asOptionalString(input.decisionNotes) ?? null
          ),
        });
      }

      case "partiallyApprovePayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.approve,
          payableId
        );
        const approvedAmount = asOptionalNumber(input.approvedAmount);
        if (approvedAmount == null || approvedAmount <= 0) {
          return NextResponse.json(
            {
              success: false,
              message: "approvedAmount must be a number greater than 0.",
            },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          data: await service.partiallyApprovePayable(
            actorFrom(access),
            payableId,
            approvedAmount,
            asOptionalString(input.decisionNotes) ?? null
          ),
        });
      }

      case "rejectPayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.approve,
          payableId
        );
        const reason = requireNonEmptyString(input.reason, "reason");
        return NextResponse.json({
          success: true,
          data: await service.rejectPayable(
            actorFrom(access),
            payableId,
            reason
          ),
        });
      }

      case "queryPayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.review,
          payableId
        );
        const reason = requireNonEmptyString(input.reason, "reason");
        return NextResponse.json({
          success: true,
          data: await service.queryPayable(
            actorFrom(access),
            payableId,
            reason
          ),
        });
      }

      case "cancelPayable": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayableAny(
          [
            FINANCE_PAYABLE_CAPABILITIES.create,
            FINANCE_PAYABLE_CAPABILITIES.review,
          ],
          payableId
        );
        return NextResponse.json({
          success: true,
          data: await service.cancelPayable(
            actorFrom(access),
            payableId,
            asOptionalString(input.reason) ?? null
          ),
        });
      }

      case "uploadDocument": {
        rejectClientStorageAuthority(input);
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.create,
          payableId
        );
        const documentRole = requireDocumentRole(input.documentRole);
        const filename = requireNonEmptyString(input.filename, "filename");
        const bytes = decodeBase64File(input.contentBase64);
        return NextResponse.json({
          success: true,
          data: await service.uploadDocument(actorFrom(access), {
            payableId,
            documentRole,
            filename,
            declaredMimeType: asOptionalString(input.mimeType) ?? null,
            bytes,
          }),
        });
      }

      case "removeDocument": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const documentId = requireUuid(input.documentId, "documentId");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.create,
          payableId
        );
        return NextResponse.json({
          success: true,
          data: await service.removeDocument(actorFrom(access), {
            payableId,
            documentId,
          }),
        });
      }

      case "supersedeDocument": {
        rejectClientStorageAuthority(input);
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const documentId = requireUuid(input.documentId, "documentId");
        const { access, service } = await gateExistingPayable(
          FINANCE_PAYABLE_CAPABILITIES.create,
          payableId
        );
        const filename = requireNonEmptyString(input.filename, "filename");
        const bytes = decodeBase64File(input.contentBase64);
        const roleRaw = input.documentRole;
        const documentRole =
          roleRaw === undefined || roleRaw === null
            ? undefined
            : requireDocumentRole(roleRaw);
        return NextResponse.json({
          success: true,
          data: await service.supersedeDocument(actorFrom(access), {
            payableId,
            documentId,
            filename,
            declaredMimeType: asOptionalString(input.mimeType) ?? null,
            bytes,
            documentRole,
          }),
        });
      }

      case "getDocumentSignedUrl": {
        const payableId = requireUuid(body.id ?? input.payableId, "id");
        const documentId = requireUuid(input.documentId, "documentId");
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getDocumentSignedUrl(actorFrom(access), {
            payableId,
            documentId,
          }),
        });
      }

      default: {
        return NextResponse.json(
          { success: false, message: `Unknown action: ${String(action)}` },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleMultipartDocumentPost(request: Request) {
  try {
    const form = await request.formData();
    const action = String(form.get("action") ?? "");
    const payableId = requireUuid(form.get("id") ?? form.get("payableId"), "id");
    const file = form.get("file");

    if (action !== "uploadDocument" && action !== "supersedeDocument") {
      return NextResponse.json(
        {
          success: false,
          message:
            "multipart/form-data is only supported for uploadDocument and supersedeDocument.",
        },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "file is required." },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const filename =
      typeof form.get("filename") === "string" &&
      String(form.get("filename")).trim()
        ? String(form.get("filename")).trim()
        : file.name;

    if (
      form.get("storagePath") ||
      form.get("storageBucket") ||
      form.get("path")
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Client must not supply storage bucket or path.",
        },
        { status: 400 }
      );
    }

    const { access, service } = await gateExistingPayable(
      FINANCE_PAYABLE_CAPABILITIES.create,
      payableId
    );
    const actor = actorFrom(access);

    if (action === "uploadDocument") {
      const documentRole = requireDocumentRole(form.get("documentRole"));
      return NextResponse.json({
        success: true,
        data: await service.uploadDocument(actor, {
          payableId,
          documentRole,
          filename,
          declaredMimeType: file.type || null,
          bytes,
        }),
      });
    }

    const documentId = requireUuid(form.get("documentId"), "documentId");
    const roleRaw = form.get("documentRole");
    const documentRole =
      roleRaw === null || roleRaw === undefined || String(roleRaw) === ""
        ? undefined
        : requireDocumentRole(roleRaw);

    return NextResponse.json({
      success: true,
      data: await service.supersedeDocument(actor, {
        payableId,
        documentId,
        filename,
        declaredMimeType: file.type || null,
        bytes,
        documentRole,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
