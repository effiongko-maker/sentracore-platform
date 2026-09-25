/**
 * Platform Finance — Review & Post API across source events (supplier bills; payments via /payments).
 * Journals are created only by the canonical posting engine, through database functions that build and enforce the
 * accounting lines. Operational records (vendor bills, payables, payments) are never written here.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";
import { requirePlatformFinanceAccessAny } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceAccountingReviewServerService } from "@/modules/platform-finance/server/PlatformFinanceAccountingReviewServerService";

type Action = "listAccountingWork" | "getSupplierBillReview" | "postSupplierBill";
type Body = { action?: Action; input?: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw Object.assign(new Error(`${field} must be a valid UUID.`), { statusHint: 400 });
  }
  return value;
}

function sanitize(message: string): string {
  const trimmed = message.trim();
  if (!trimmed || /service[_-]?role|apikey|bearer|password|secret/i.test(trimmed)) return "Accounting review operation failed.";
  return trimmed.slice(0, 400);
}

function errorResponse(error: unknown) {
  if (isActionError(error)) {
    const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "FORBIDDEN" ? 403 : error.code === "VALIDATION_ERROR" ? 422 : 500;
    return NextResponse.json({ success: false, code: error.code, message: sanitize(error.message) }, { status });
  }
  if (error && typeof error === "object" && typeof (error as { statusHint?: unknown }).statusHint === "number") {
    return NextResponse.json({ success: false, message: sanitize(error instanceof Error ? error.message : "Invalid request.") }, { status: (error as { statusHint: number }).statusHint });
  }
  return NextResponse.json({ success: false, message: "Accounting review operation failed." }, { status: 500 });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
  }
  try {
    const actor = (access: { organisationId: string; profileId: string }) => ({ organisationId: access.organisationId, profileId: access.profileId });
    switch (body.action) {
      case "listAccountingWork": {
        const access = await requirePlatformFinanceAccessAny({ capabilities: [
          PLATFORM_FINANCE_CAPABILITIES.view,
          PLATFORM_FINANCE_CAPABILITIES.create_transaction,
          PLATFORM_FINANCE_CAPABILITIES.post,
        ] });
        const service = new PlatformFinanceAccountingReviewServerService(access.organisationId);
        return NextResponse.json({ success: true, data: await service.listWork(actor(access)) });
      }
      case "getSupplierBillReview": {
        const vendorBillId = requireUuid(body.input?.vendorBillId, "vendorBillId");
        const access = await requirePlatformFinanceAccessAny({ capabilities: [
          PLATFORM_FINANCE_CAPABILITIES.view,
          PLATFORM_FINANCE_CAPABILITIES.create_transaction,
          PLATFORM_FINANCE_CAPABILITIES.post,
        ] });
        const service = new PlatformFinanceAccountingReviewServerService(access.organisationId);
        const startReview = body.input?.startReview !== false;
        return NextResponse.json({ success: true, data: await service.getSupplierBillReview(actor(access), vendorBillId, { startReview }) });
      }
      case "postSupplierBill": {
        const vendorBillId = requireUuid(body.input?.vendorBillId, "vendorBillId");
        const debitAccountId = requireUuid(body.input?.debitAccountId, "debitAccountId");
        const access = await requirePlatformFinanceAccessAny({ capabilities: [PLATFORM_FINANCE_CAPABILITIES.post] });
        const service = new PlatformFinanceAccountingReviewServerService(access.organisationId);
        return NextResponse.json({ success: true, data: await service.postSupplierBill(actor(access), vendorBillId, debitAccountId) });
      }
      default:
        return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
