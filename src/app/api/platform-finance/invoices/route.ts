/**
 * Platform Finance Invoices API — sales invoicing (Phase 2F-A).
 * No Receivable domain. Accounting via finance_invoice_issue_and_post RPC.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { PLATFORM_FINANCE_CAPABILITIES, type PlatformFinanceCapability } from "@/modules/platform-finance/types";
import {
  requirePlatformFinanceAccess,
  requirePlatformFinanceAccessAny,
} from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import {
  PlatformFinanceInvoicesServerService,
  type InvoiceLineInput,
} from "@/modules/platform-finance/server/PlatformFinanceInvoicesServerService";

type Action =
  | "getMyInvoiceCapabilities"
  | "listAccessibleCompanies"
  | "listRevenueAccounts"
  | "listInvoices"
  | "getInvoiceDetail"
  | "createInvoice"
  | "updateDraftInvoice"
  | "submitInvoiceForReview"
  | "returnInvoiceToDraft"
  | "getInvoiceAccountingPreview"
  | "issueAndPostInvoice"
  | "deleteDraftInvoice";

const READ_CAPS = [
  PLATFORM_FINANCE_CAPABILITIES.invoice_view,
  PLATFORM_FINANCE_CAPABILITIES.invoice_create,
  PLATFORM_FINANCE_CAPABILITIES.invoice_review,
  PLATFORM_FINANCE_CAPABILITIES.invoice_issue,
] as const satisfies readonly PlatformFinanceCapability[];

type Body = {
  action?: Action;
  id?: string;
  input?: Record<string, unknown>;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseLines(raw: unknown): InvoiceLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      description: String(row.description ?? ""),
      quantity: asNumber(row.quantity) ?? 0,
      unitPrice: asNumber(row.unitPrice) ?? 0,
      revenueGlAccountId: String(row.revenueGlAccountId ?? ""),
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const action = body.action;
    if (!action) {
      return NextResponse.json({ success: false, message: "action required" }, { status: 400 });
    }

    if (
      action === "getMyInvoiceCapabilities" ||
      action === "listAccessibleCompanies" ||
      action === "listRevenueAccounts" ||
      action === "listInvoices" ||
      action === "getInvoiceDetail" ||
      action === "getInvoiceAccountingPreview"
    ) {
      const access = await requirePlatformFinanceAccessAny({ capabilities: READ_CAPS });
      const svc = new PlatformFinanceInvoicesServerService(access.organisationId);
      const actor = { organisationId: access.organisationId, profileId: access.profileId };
      if (action === "getMyInvoiceCapabilities") {
        return NextResponse.json({ success: true, data: await svc.getMyCapabilities(actor) });
      }
      if (action === "listAccessibleCompanies") {
        return NextResponse.json({ success: true, data: await svc.listAccessibleCompanies(actor) });
      }
      if (action === "listRevenueAccounts") {
        return NextResponse.json({ success: true, data: await svc.listRevenueAccounts(actor) });
      }
      if (action === "listInvoices") {
        return NextResponse.json({ success: true, data: await svc.list(actor) });
      }
      if (!body.id) {
        return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
      }
      if (action === "getInvoiceAccountingPreview") {
        return NextResponse.json({
          success: true,
          data: await svc.getAccountingPreview(actor, body.id),
        });
      }
      return NextResponse.json({ success: true, data: await svc.getDetail(actor, body.id) });
    }

    if (
      action === "createInvoice" ||
      action === "updateDraftInvoice" ||
      action === "deleteDraftInvoice"
    ) {
      const access = await requirePlatformFinanceAccess({
        capability: PLATFORM_FINANCE_CAPABILITIES.invoice_create,
      });
      const svc = new PlatformFinanceInvoicesServerService(access.organisationId);
      const actor = { organisationId: access.organisationId, profileId: access.profileId };
      const input = body.input ?? {};
      if (action === "deleteDraftInvoice") {
        if (!body.id) {
          return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
        }
        return NextResponse.json({
          success: true,
          data: await svc.deleteDraft(actor, body.id),
        });
      }
      if (action === "createInvoice") {
        return NextResponse.json({
          success: true,
          data: await svc.create(actor, {
            companyId: String(input.companyId ?? ""),
            counterpartyId: String(input.counterpartyId ?? ""),
            invoiceDate: String(input.invoiceDate ?? ""),
            dueDate: String(input.dueDate ?? ""),
            currency: input.currency ? String(input.currency) : "NGN",
            description: (input.description as string | null | undefined) ?? null,
            lines: parseLines(input.lines),
          }),
        });
      }
      if (!body.id) {
        return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        data: await svc.updateDraft(actor, body.id, {
          counterpartyId: input.counterpartyId ? String(input.counterpartyId) : undefined,
          invoiceDate: input.invoiceDate ? String(input.invoiceDate) : undefined,
          dueDate: input.dueDate ? String(input.dueDate) : undefined,
          currency: input.currency ? String(input.currency) : undefined,
          description:
            input.description === undefined
              ? undefined
              : ((input.description as string | null) ?? null),
          lines: input.lines === undefined ? undefined : parseLines(input.lines),
        }),
      });
    }

    if (action === "submitInvoiceForReview" || action === "returnInvoiceToDraft") {
      const access = await requirePlatformFinanceAccessAny({
        capabilities: [
          PLATFORM_FINANCE_CAPABILITIES.invoice_create,
          PLATFORM_FINANCE_CAPABILITIES.invoice_review,
        ],
      });
      const svc = new PlatformFinanceInvoicesServerService(access.organisationId);
      const actor = { organisationId: access.organisationId, profileId: access.profileId };
      if (!body.id) {
        return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
      }
      if (action === "submitInvoiceForReview") {
        return NextResponse.json({
          success: true,
          data: await svc.submitForReview(actor, body.id),
        });
      }
      return NextResponse.json({
        success: true,
        data: await svc.returnToDraft(actor, body.id),
      });
    }

    if (action === "issueAndPostInvoice") {
      const access = await requirePlatformFinanceAccess({
        capability: PLATFORM_FINANCE_CAPABILITIES.invoice_issue,
      });
      const svc = new PlatformFinanceInvoicesServerService(access.organisationId);
      const actor = { organisationId: access.organisationId, profileId: access.profileId };
      if (!body.id) {
        return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        data: await svc.issueAndPost(actor, body.id),
      });
    }

    return NextResponse.json({ success: false, message: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (isActionError(error)) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "FORBIDDEN" || error.code === "MODULE_NOT_ENABLED"
            ? 403
            : error.code === "VALIDATION_ERROR"
              ? 400
              : 500;
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status }
      );
    }
    console.error("[platform-finance/invoices]", error);
    return NextResponse.json({ success: false, message: "Internal error" }, { status: 500 });
  }
}
