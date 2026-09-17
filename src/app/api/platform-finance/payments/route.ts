/**
 * Platform Finance Payments API — Phase 2C.
 * Confirm external disbursements; single-Payable destination reveal.
 * No journals / finance_post_transaction.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import {
  FINANCE_PAYMENT_CAPABILITIES,
  PLATFORM_FINANCE_CAPABILITIES,
} from "@/modules/platform-finance/types";
import {
  requirePlatformFinanceAccessAny,
} from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinancePaymentsServerService } from "@/modules/platform-finance/server/PlatformFinancePaymentsServerService";
import { PlatformFinancePayablesServerService } from "@/modules/platform-finance/server/PlatformFinancePayablesServerService";
import { PlatformFinancePaymentAccountingServerService } from "@/modules/platform-finance/server/PlatformFinancePaymentAccountingServerService";

type PaymentApiAction =
  | "getMyPaymentCapabilities"
  | "listPaymentsForPayable"
  | "listPayableSourceFinancialAccounts"
  | "confirmPayment"
  | "revealPayableDestination"
  | "listPaymentAccountingWork"
  | "getPaymentAccountingReview"
  | "postPaymentAccounting";

type RequestBody = {
  action?: PaymentApiAction;
  payableId?: string;
  input?: Record<string, unknown>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function requireUuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw Object.assign(new Error(`${field} must be a valid UUID.`), {
      statusHint: 400,
    });
  }
  return value;
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value;
}

function requirePositiveAmount(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    throw Object.assign(new Error("amount must be a positive number."), {
      statusHint: 400,
    });
  }
  return n;
}

function sanitizeClientMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Finance payment operation failed.";
  if (/service[_-]?role|apikey|bearer|password|secret/i.test(trimmed)) {
    return "Finance payment operation failed.";
  }
  return trimmed.slice(0, 400);
}

function errorResponse(error: unknown) {
  if (isActionError(error)) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "FORBIDDEN"
          ? 403
          : error.code === "VALIDATION_ERROR"
            ? 422
            : 500;
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        message: sanitizeClientMessage(error.message),
      },
      { status }
    );
  }
  if (
    error &&
    typeof error === "object" &&
    "statusHint" in error &&
    typeof (error as { statusHint?: unknown }).statusHint === "number"
  ) {
    return NextResponse.json(
      {
        success: false,
        message: sanitizeClientMessage(
          error instanceof Error ? error.message : "Invalid request."
        ),
      },
      { status: (error as { statusHint: number }).statusHint }
    );
  }
  return NextResponse.json(
    {
      success: false,
      message: sanitizeClientMessage(
        error instanceof Error ? error.message : "Finance payment operation failed."
      ),
    },
    { status: 500 }
  );
}

function actorFrom(access: { organisationId: string; profileId: string }) {
  return {
    organisationId: access.organisationId,
    profileId: access.profileId,
  };
}

async function gatePayableCompany(
  payableId: string,
  capabilities: readonly string[]
) {
  const preliminary = await requirePlatformFinanceAccessAny({
    capabilities: capabilities as never,
  });
  const payables = new PlatformFinancePayablesServerService(
    preliminary.organisationId
  );
  const existing = await payables.repository.getPayable(payableId);
  if (!existing) {
    throw Object.assign(new Error("Finance payable not found."), {
      statusHint: 404,
    });
  }
  const access = await requirePlatformFinanceAccessAny({
    capabilities: capabilities as never,
    companyId: existing.companyId,
  });
  return {
    access,
    service: new PlatformFinancePaymentsServerService(access.organisationId),
    existing,
  };
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

    if (action === "getMyPaymentCapabilities") {
      const access = await requirePlatformFinanceAccessAny({
        capabilities: [
          FINANCE_PAYMENT_CAPABILITIES.view,
          FINANCE_PAYMENT_CAPABILITIES.execute,
          PLATFORM_FINANCE_CAPABILITIES.view,
        ],
      });
      const service = new PlatformFinancePaymentsServerService(
        access.organisationId
      );
      const data = await service.getMyPaymentCapabilities(actorFrom(access));
      return NextResponse.json({ success: true, data });
    }

    if (action === "listPaymentsForPayable") {
      const payableId = requireUuid(body.payableId, "payableId");
      const { access, service } = await gatePayableCompany(payableId, [
        FINANCE_PAYMENT_CAPABILITIES.view,
        FINANCE_PAYMENT_CAPABILITIES.execute,
      ]);
      const data = await service.listPaymentsForPayable(
        actorFrom(access),
        payableId
      );
      return NextResponse.json({ success: true, data });
    }

    if (action === "listPayableSourceFinancialAccounts") {
      const payableId = requireUuid(body.payableId, "payableId");
      const { access, service } = await gatePayableCompany(payableId, [
        FINANCE_PAYMENT_CAPABILITIES.execute,
      ]);
      const data = await service.listPayableSourceFinancialAccounts(
        actorFrom(access),
        payableId
      );
      return NextResponse.json({ success: true, data });
    }

    if (action === "confirmPayment") {
      const payableId = requireUuid(
        body.payableId ?? body.input?.payableId,
        "payableId"
      );
      const { access, service } = await gatePayableCompany(payableId, [
        FINANCE_PAYMENT_CAPABILITIES.execute,
      ]);
      const input = body.input ?? {};
      const data = await service.confirmPayment(actorFrom(access), {
        payableId,
        sourceFinancialAccountId: requireUuid(
          input.sourceFinancialAccountId,
          "sourceFinancialAccountId"
        ),
        amount: requirePositiveAmount(input.amount),
        paymentDate: (() => {
          const value = asOptionalString(input.paymentDate);
          if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw Object.assign(new Error("paymentDate must be YYYY-MM-DD."), {
              statusHint: 400,
            });
          }
          return value;
        })(),
        externalReference: asOptionalString(input.externalReference) ?? null,
      });
      return NextResponse.json({ success: true, data });
    }

    if (action === "revealPayableDestination") {
      const payableId = requireUuid(body.payableId, "payableId");
      const { access, service } = await gatePayableCompany(payableId, [
        FINANCE_PAYMENT_CAPABILITIES.execute,
      ]);
      const data = await service.revealPayableDestinationAccountNumber(
        actorFrom(access),
        payableId
      );
      return NextResponse.json({ success: true, data });
    }

    if (action === "listPaymentAccountingWork") {
      const access = await requirePlatformFinanceAccessAny({ capabilities: [
        PLATFORM_FINANCE_CAPABILITIES.view,
        PLATFORM_FINANCE_CAPABILITIES.create_transaction,
        PLATFORM_FINANCE_CAPABILITIES.post,
      ] });
      const service = new PlatformFinancePaymentAccountingServerService(access.organisationId);
      return NextResponse.json({ success: true, data: await service.listWork(actorFrom(access)) });
    }

    if (action === "getPaymentAccountingReview" || action === "postPaymentAccounting") {
      const paymentId = requireUuid(body.input?.paymentId, "paymentId");
      const preliminary = await requirePlatformFinanceAccessAny({ capabilities: [
        action === "postPaymentAccounting" ? PLATFORM_FINANCE_CAPABILITIES.post : PLATFORM_FINANCE_CAPABILITIES.create_transaction,
      ] });
      const service = new PlatformFinancePaymentAccountingServerService(preliminary.organisationId);
      const data = action === "postPaymentAccounting"
        ? await service.post(actorFrom(preliminary), paymentId, requireUuid(body.input?.debitAccountId, "debitAccountId"))
        : await service.getOrCreateReview(actorFrom(preliminary), paymentId);
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, message: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
