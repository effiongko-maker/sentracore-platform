/**
 * Platform Finance Vendor Bills API — thin action dispatcher.
 * Business rules / SoD / company access live in RPCs + server service.
 *
 * CEO approval (platform_finance.request.approve) is the only path that mints
 * the obligation, and it does so inside SQL. There is no createPayable action
 * here and no vendor_bill.approve capability.
 *
 * No Banking, Payments, posting, vendor master, or UI screens in this slice.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import {
  FINANCE_VENDOR_BILL_CAPABILITIES,
  FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
  FINANCE_VENDOR_BILL_DOCUMENT_ROLES,
  FINANCE_VENDOR_BILL_PAYEE_TYPES,
  PLATFORM_FINANCE_CAPABILITIES,
  type FinanceVendorBillDocumentRole,
  type FinanceVendorBillPayeeType,
  type PlatformFinanceCapability,
  type PaymentDestinationInput,
  type PaymentDestinationMutation,
} from "@/modules/platform-finance/types";
import {
  requirePlatformFinanceAccess,
  requirePlatformFinanceAccessAny,
} from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceVendorBillsServerService } from "@/modules/platform-finance/server/PlatformFinanceVendorBillsServerService";
import { isFinanceVendorBillDocumentRole } from "@/modules/platform-finance/server/vendorBillDocumentStorage";

type VendorBillApiAction =
  | "getVendorBill"
  | "getVendorBillDetail"
  | "listMyVendorBills"
  | "listAccessibleVendorBills"
  | "listReviewQueue"
  | "listApprovalQueue"
  | "listAccessibleCompanies"
  | "getMyVendorBillCapabilities"
  | "createVendorBill"
  | "updateDraftVendorBill"
  | "submitVendorBill"
  | "startReview"
  | "queryVendorBill"
  | "resubmitVendorBill"
  | "sendToCeo"
  | "approveVendorBill"
  | "partiallyApproveVendorBill"
  | "rejectVendorBill"
  | "uploadDocument"
  | "removeDocument"
  | "supersedeDocument"
  | "getDocumentSignedUrl";

const REGISTER_READ_CAPABILITIES = [
  PLATFORM_FINANCE_CAPABILITIES.view,
  FINANCE_VENDOR_BILL_CAPABILITIES.view,
  FINANCE_VENDOR_BILL_CAPABILITIES.create,
  FINANCE_VENDOR_BILL_CAPABILITIES.review,
  FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
] as const satisfies readonly PlatformFinanceCapability[];

type RequestBody = {
  action?: VendorBillApiAction;
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

function asOptionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
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

function requirePayeeType(value: unknown): FinanceVendorBillPayeeType {
  if (
    typeof value !== "string" ||
    !(FINANCE_VENDOR_BILL_PAYEE_TYPES as readonly string[]).includes(value)
  ) {
    throw Object.assign(new Error("payeeType is invalid."), {
      statusHint: 400,
    });
  }
  return value as FinanceVendorBillPayeeType;
}

function parsePaymentDestination(value: unknown): PaymentDestinationInput | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("paymentDestination must be an object."), { statusHint: 400 });
  }
  const row = value as Record<string, unknown>;
  if (row.paymentMethod !== "bank_transfer") {
    throw Object.assign(new Error("paymentMethod must be bank_transfer."), { statusHint: 400 });
  }
  return {
    paymentMethod: "bank_transfer",
    bankName: requireNonEmptyString(row.bankName, "bankName"),
    accountName: requireNonEmptyString(row.accountName, "accountName"),
    accountNumber: requireNonEmptyString(row.accountNumber, "accountNumber"),
  };
}

function parsePaymentDestinationMutation(value: unknown): PaymentDestinationMutation {
  if (value === undefined || value === null) return { action: "preserve" };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("paymentDestinationMutation must be an object."), { statusHint: 400 });
  }
  const row = value as Record<string, unknown>;
  if (row.action === "preserve" || row.action === "remove") return { action: row.action };
  if (row.action === "replace") {
    const destination = parsePaymentDestination(row.destination);
    if (!destination) throw Object.assign(new Error("replacement destination is required."), { statusHint: 400 });
    return { action: "replace", destination };
  }
  throw Object.assign(new Error("payment destination action must be preserve, replace, or remove."), { statusHint: 400 });
}

function requireDocumentRole(value: unknown): FinanceVendorBillDocumentRole {
  if (!isFinanceVendorBillDocumentRole(value)) {
    throw Object.assign(
      new Error(
        `documentRole must be one of: ${FINANCE_VENDOR_BILL_DOCUMENT_ROLES.join(
          ", "
        )}.`
      ),
      { statusHint: 400 }
    );
  }
  return value;
}

function requireActorRole(value: unknown): "finance" | "ceo" {
  if (value === "finance" || value === "ceo") return value;
  throw Object.assign(new Error("actorRole must be finance or ceo."), {
    statusHint: 400,
  });
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

/**
 * Callers must never nominate the actor, organisation, status, approved amount,
 * or payable linkage on an inputter action. approvedAmount is accepted only by
 * partiallyApproveVendorBill, which does not call this guard.
 */
function rejectClientAuthorityFields(input: Record<string, unknown>) {
  if (
    input.status != null ||
    input.approvedAmount != null ||
    input.inputterProfileId != null ||
    input.organisationId != null ||
    input.payableId != null ||
    input.sourceType != null ||
    input.sourceId != null
  ) {
    throw Object.assign(
      new Error(
        "Client must not supply status, actor, organisation, or payable linkage."
      ),
      { statusHint: 400 }
    );
  }
}

function decodeBase64File(
  contentBase64: unknown,
  field = "contentBase64"
): Buffer {
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
  if (!trimmed) return "Vendor bill operation failed.";
  return trimmed
    .replace(/^finance_vendor_bill_[a-z_]+:\s*/i, "")
    .replace(/^finance_payable_[a-z_]+:\s*/i, "")
    .replace(/^finance_request_[a-z_]+:\s*/i, "")
    .replace(/\b(sqlstate|postgres|plpgsql)\b/gi, "")
    .trim()
    .slice(0, 280);
}

function rejectClientCryptographicFields(input: Record<string, unknown>) {
  const encoded = JSON.stringify(input);
  if (/ciphertext|authTag|auth_tag|encryptionKey|key_version|accountNumberLast4|account_number_last4/i.test(encoded)) {
    throw Object.assign(new Error("Client must not supply encrypted payment destination fields."), { statusHint: 400 });
  }
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
      : "Vendor bill operation failed.";
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

async function gateExistingVendorBill(
  capability: PlatformFinanceCapability,
  vendorBillId: string
) {
  const preliminary = await requirePlatformFinanceAccess({ capability });
  const service = new PlatformFinanceVendorBillsServerService(
    preliminary.organisationId
  );
  const existing = await service.repository.getVendorBill(vendorBillId);
  if (!existing) {
    throw Object.assign(new Error("Vendor bill not found."), {
      statusHint: 404,
    });
  }
  const access = await requirePlatformFinanceAccess({
    capability,
    companyId: existing.companyId,
  });
  return {
    access,
    service: new PlatformFinanceVendorBillsServerService(access.organisationId),
    existing,
  };
}

async function gateExistingVendorBillAny(
  capabilities: readonly PlatformFinanceCapability[],
  vendorBillId: string
) {
  const preliminary = await requirePlatformFinanceAccessAny({ capabilities });
  const service = new PlatformFinanceVendorBillsServerService(
    preliminary.organisationId
  );
  const existing = await service.repository.getVendorBill(vendorBillId);
  if (!existing) {
    throw Object.assign(new Error("Vendor bill not found."), {
      statusHint: 404,
    });
  }
  const access = await requirePlatformFinanceAccessAny({
    capabilities,
    companyId: existing.companyId,
  });
  return {
    access,
    service: new PlatformFinanceVendorBillsServerService(access.organisationId),
    existing,
  };
}

/** GET → list my vendor bills (session-derived inputter). */
export async function GET() {
  try {
    const access = await requirePlatformFinanceAccessAny({
      capabilities: [
        FINANCE_VENDOR_BILL_CAPABILITIES.create,
        FINANCE_VENDOR_BILL_CAPABILITIES.view,
      ],
    });
    const service = new PlatformFinanceVendorBillsServerService(
      access.organisationId
    );
    const data = await service.listMyVendorBills(actorFrom(access));
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
    rejectClientCryptographicFields(input);

    switch (action) {
      case "listMyVendorBills": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCE_VENDOR_BILL_CAPABILITIES.create,
            FINANCE_VENDOR_BILL_CAPABILITIES.view,
          ],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listMyVendorBills(actorFrom(access)),
        });
      }

      case "listAccessibleVendorBills": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        const actor = actorFrom(access);
        const vendorBills = await service.listAccessibleVendorBills(actor);
        const inputters = await service.listInputterSummaries(
          actor,
          vendorBills.map((b) => b.inputterProfileId)
        );
        return NextResponse.json({
          success: true,
          data: { vendorBills, inputters },
        });
      }

      case "listReviewQueue": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCE_VENDOR_BILL_CAPABILITIES.review,
            FINANCE_VENDOR_BILL_CAPABILITIES.view,
            PLATFORM_FINANCE_CAPABILITIES.view,
          ],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listReviewQueue(actorFrom(access)),
        });
      }

      case "listApprovalQueue": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
            FINANCE_VENDOR_BILL_CAPABILITIES.view,
            PLATFORM_FINANCE_CAPABILITIES.view,
          ],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listApprovalQueue(actorFrom(access)),
        });
      }

      case "listAccessibleCompanies": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [
            FINANCE_VENDOR_BILL_CAPABILITIES.create,
            FINANCE_VENDOR_BILL_CAPABILITIES.view,
            PLATFORM_FINANCE_CAPABILITIES.view,
          ],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.listAccessibleCompanies(actorFrom(access)),
        });
      }

      case "getMyVendorBillCapabilities": {
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getMyVendorBillCapabilities(actorFrom(access)),
        });
      }

      case "getVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getVendorBill(actorFrom(access), vendorBillId),
        });
      }

      case "getVendorBillDetail": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const access = await requirePlatformFinanceAccessAny({
          capabilities: [...REGISTER_READ_CAPABILITIES],
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.getVendorBillDetail(
            actorFrom(access),
            vendorBillId
          ),
        });
      }

      case "createVendorBill": {
        // Auth before field validation so unauthenticated callers get 401.
        await requirePlatformFinanceAccess({
          capability: FINANCE_VENDOR_BILL_CAPABILITIES.create,
        });
        rejectClientAuthorityFields(input);
        const companyId = requireUuid(
          input.companyId ?? body.companyId,
          "companyId"
        );
        const billedAmount = asOptionalNumber(input.billedAmount);
        if (billedAmount == null || billedAmount < 0) {
          return NextResponse.json(
            {
              success: false,
              message: "billedAmount must be a number greater than or equal to 0.",
            },
            { status: 400 }
          );
        }
        const purpose = requireNonEmptyString(input.purpose, "purpose");
        const payeeName = requireNonEmptyString(input.payeeName, "payeeName");
        const payeeType = requirePayeeType(input.payeeType);
        const access = await requirePlatformFinanceAccess({
          capability: FINANCE_VENDOR_BILL_CAPABILITIES.create,
          companyId,
        });
        const service = new PlatformFinanceVendorBillsServerService(
          access.organisationId
        );
        return NextResponse.json({
          success: true,
          data: await service.createVendorBill(actorFrom(access), {
            companyId,
            billedAmount,
            purpose,
            payeeName,
            payeeType,
            description: asOptionalString(input.description) ?? null,
            invoiceReference: asOptionalString(input.invoiceReference) ?? null,
            invoiceDate: asOptionalString(input.invoiceDate) ?? null,
            goodsServicesReceived:
              asOptionalBoolean(input.goodsServicesReceived) ?? false,
            dueDate: asOptionalString(input.dueDate) ?? null,
            projectContractRef:
              asOptionalString(input.projectContractRef) ?? null,
            currency:
              typeof input.currency === "string" ? input.currency : undefined,
            paymentDestination: parsePaymentDestination(input.paymentDestination),
          }),
        });
      }

      case "updateDraftVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        rejectClientAuthorityFields(input);
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.create,
          vendorBillId
        );
        const billedAmount = asOptionalNumber(input.billedAmount);
        if (
          input.billedAmount !== undefined &&
          input.billedAmount !== null &&
          (billedAmount == null || billedAmount < 0)
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "billedAmount must be a number greater than or equal to 0.",
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
          data: await service.updateDraftVendorBill(
            actorFrom(access),
            vendorBillId,
            {
              billedAmount,
              purpose: asOptionalString(input.purpose),
              payeeName: asOptionalString(input.payeeName),
              payeeType: payeeType ?? null,
              description: asOptionalString(input.description),
              invoiceReference: asOptionalString(input.invoiceReference),
              invoiceDate: asOptionalString(input.invoiceDate),
              clearInvoiceDate: Boolean(input.clearInvoiceDate),
              goodsServicesReceived: asOptionalBoolean(
                input.goodsServicesReceived
              ),
              dueDate: asOptionalString(input.dueDate),
              clearDueDate: Boolean(input.clearDueDate),
              projectContractRef: asOptionalString(input.projectContractRef),
              currency: asOptionalString(input.currency),
              paymentDestinationMutation: parsePaymentDestinationMutation(
                input.paymentDestinationMutation
              ),
            }
          ),
        });
      }

      case "submitVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.create,
          vendorBillId
        );
        return NextResponse.json({
          success: true,
          data: await service.submitVendorBill(actorFrom(access), vendorBillId),
        });
      }

      case "startReview": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.review,
          vendorBillId
        );
        return NextResponse.json({
          success: true,
          data: await service.startReview(actorFrom(access), vendorBillId),
        });
      }

      case "queryVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const actorRole = requireActorRole(input.actorRole);
        const capability =
          actorRole === "finance"
            ? FINANCE_VENDOR_BILL_CAPABILITIES.review
            : FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY;
        const { access, service } = await gateExistingVendorBill(
          capability,
          vendorBillId
        );
        const reason = requireNonEmptyString(input.reason, "reason");
        return NextResponse.json({
          success: true,
          data: await service.queryVendorBill(
            actorFrom(access),
            vendorBillId,
            reason,
            actorRole
          ),
        });
      }

      case "resubmitVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        rejectClientAuthorityFields(input);
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.create,
          vendorBillId
        );
        const billedAmount = asOptionalNumber(input.billedAmount);
        if (
          input.billedAmount !== undefined &&
          input.billedAmount !== null &&
          (billedAmount == null || billedAmount <= 0)
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "billedAmount must be a number greater than 0.",
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
          data: await service.resubmitVendorBill(
            actorFrom(access),
            vendorBillId,
            {
              billedAmount,
              purpose: asOptionalString(input.purpose),
              payeeName: asOptionalString(input.payeeName),
              payeeType: payeeType ?? null,
              description: asOptionalString(input.description),
              invoiceReference: asOptionalString(input.invoiceReference),
              invoiceDate: asOptionalString(input.invoiceDate),
              clearInvoiceDate: Boolean(input.clearInvoiceDate),
              goodsServicesReceived: asOptionalBoolean(
                input.goodsServicesReceived
              ),
              dueDate: asOptionalString(input.dueDate),
              clearDueDate: Boolean(input.clearDueDate),
              projectContractRef: asOptionalString(input.projectContractRef),
              paymentDestinationMutation: parsePaymentDestinationMutation(
                input.paymentDestinationMutation
              ),
            }
          ),
        });
      }

      case "sendToCeo": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.review,
          vendorBillId
        );
        return NextResponse.json({
          success: true,
          data: await service.sendToCeo(
            actorFrom(access),
            vendorBillId,
            asOptionalString(input.financeNotes) ?? null
          ),
        });
      }

      case "approveVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        // CEO authority reuses platform_finance.request.approve.
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
          vendorBillId
        );
        return NextResponse.json({
          success: true,
          data: await service.approveVendorBill(
            actorFrom(access),
            vendorBillId,
            asOptionalString(input.decisionNotes) ?? null
          ),
        });
      }

      case "partiallyApproveVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
          vendorBillId
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
          data: await service.partiallyApproveVendorBill(
            actorFrom(access),
            vendorBillId,
            approvedAmount,
            asOptionalString(input.decisionNotes) ?? null
          ),
        });
      }

      case "rejectVendorBill": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
          vendorBillId
        );
        const reason = requireNonEmptyString(input.reason, "reason");
        return NextResponse.json({
          success: true,
          data: await service.rejectVendorBill(
            actorFrom(access),
            vendorBillId,
            reason
          ),
        });
      }

      case "uploadDocument": {
        rejectClientStorageAuthority(input);
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.create,
          vendorBillId
        );
        const documentRole = requireDocumentRole(input.documentRole);
        const filename = requireNonEmptyString(input.filename, "filename");
        const bytes = decodeBase64File(input.contentBase64);
        return NextResponse.json({
          success: true,
          data: await service.uploadDocument(actorFrom(access), {
            vendorBillId,
            documentRole,
            filename,
            declaredMimeType: asOptionalString(input.mimeType) ?? null,
            bytes,
          }),
        });
      }

      case "removeDocument": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const documentId = requireUuid(input.documentId, "documentId");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.create,
          vendorBillId
        );
        return NextResponse.json({
          success: true,
          data: await service.removeDocument(actorFrom(access), {
            vendorBillId,
            documentId,
          }),
        });
      }

      case "supersedeDocument": {
        rejectClientStorageAuthority(input);
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const documentId = requireUuid(input.documentId, "documentId");
        const { access, service } = await gateExistingVendorBill(
          FINANCE_VENDOR_BILL_CAPABILITIES.create,
          vendorBillId
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
            vendorBillId,
            documentId,
            filename,
            declaredMimeType: asOptionalString(input.mimeType) ?? null,
            bytes,
            documentRole,
          }),
        });
      }

      case "getDocumentSignedUrl": {
        const vendorBillId = requireUuid(body.id ?? input.vendorBillId, "id");
        const documentId = requireUuid(input.documentId, "documentId");
        const { access, service } = await gateExistingVendorBillAny(
          [...REGISTER_READ_CAPABILITIES],
          vendorBillId
        );
        return NextResponse.json({
          success: true,
          data: await service.getDocumentSignedUrl(actorFrom(access), {
            vendorBillId,
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
    const vendorBillId = requireUuid(
      form.get("id") ?? form.get("vendorBillId"),
      "id"
    );
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

    const { access, service } = await gateExistingVendorBill(
      FINANCE_VENDOR_BILL_CAPABILITIES.create,
      vendorBillId
    );
    const actor = actorFrom(access);

    if (action === "uploadDocument") {
      const documentRole = requireDocumentRole(form.get("documentRole"));
      return NextResponse.json({
        success: true,
        data: await service.uploadDocument(actor, {
          vendorBillId,
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
        vendorBillId,
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
