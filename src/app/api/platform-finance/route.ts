import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import {
  PLATFORM_FINANCE_CAPABILITIES,
  type PlatformFinanceCapability,
} from "@/modules/platform-finance/types";
import { requirePlatformFinanceAccess } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceServerService } from "@/modules/platform-finance/server/PlatformFinanceServerService";

type PlatformFinanceAction =
  | "getFoundationStatus"
  | "getOverview"
  | "listCompanies"
  | "listAccounts"
  | "listPeriods"
  | "listTransactions"
  | "createPeriod"
  | "createTransaction"
  | "postTransaction"
  | "closePeriod"
  | "getJournal";

type RequestBody = {
  action?: PlatformFinanceAction;
  companyId?: string;
  id?: string;
  input?: Record<string, unknown>;
};

function actionErrorStatus(code: string): number {
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
  if (code === "VALIDATION_ERROR") return 400;
  return 500;
}

function errorResponse(error: unknown) {
  if (isActionError(error)) {
    return NextResponse.json(
      { success: false, code: error.code, message: error.message },
      { status: actionErrorStatus(error.code) }
    );
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Platform Finance request failed.";
  const status = /not found|already posted|unbalanced|required|closed/i.test(
    message
  )
    ? 400
    : 500;
  return NextResponse.json({ success: false, message }, { status });
}

function capabilityForAction(
  action: PlatformFinanceAction
): PlatformFinanceCapability {
  switch (action) {
    case "createPeriod":
    case "closePeriod":
      return PLATFORM_FINANCE_CAPABILITIES.manage_periods;
    case "createTransaction":
      return PLATFORM_FINANCE_CAPABILITIES.create_transaction;
    case "postTransaction":
      return PLATFORM_FINANCE_CAPABILITIES.post;
    case "getOverview":
    default:
      return PLATFORM_FINANCE_CAPABILITIES.view;
  }
}

function companyIdForAction(
  action: PlatformFinanceAction,
  body: RequestBody
): string | undefined {
  if (
    action === "listCompanies" ||
    action === "listAccounts" ||
    action === "getFoundationStatus" ||
    action === "getOverview"
  ) {
    return undefined;
  }
  if (typeof body.companyId === "string" && body.companyId) {
    return body.companyId;
  }
  const input = body.input;
  if (input && typeof input.companyId === "string" && input.companyId) {
    return input.companyId;
  }
  return undefined;
}

export async function GET() {
  try {
    const { organisationId } = await requirePlatformFinanceAccess({
      capability: PLATFORM_FINANCE_CAPABILITIES.view,
    });
    const service = new PlatformFinanceServerService(organisationId);
    const data = await service.getFoundationStatus();
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

    const capability = capabilityForAction(action);
    const companyId = companyIdForAction(action, body);
    const access = await requirePlatformFinanceAccess({
      capability,
      companyId,
    });
    const service = new PlatformFinanceServerService(access.organisationId);

    switch (action) {
      case "getFoundationStatus":
        return NextResponse.json({
          success: true,
          data: await service.getFoundationStatus(),
        });
      case "getOverview": {
        const input = body.input ?? {};
        return NextResponse.json({
          success: true,
          data: await service.getOverview({
            profileId: access.profileId,
            companyId:
              typeof input.companyId === "string"
                ? input.companyId
                : typeof body.companyId === "string"
                  ? body.companyId
                  : null,
            periodId:
              typeof input.periodId === "string" ? input.periodId : null,
          }),
        });
      }
      case "listCompanies":
        return NextResponse.json({
          success: true,
          data: await service.listCompanies(),
        });
      case "listAccounts":
        return NextResponse.json({
          success: true,
          data: await service.listAccounts(),
        });
      case "listPeriods":
        if (!companyId) {
          return NextResponse.json(
            {
              success: false,
              message: "companyId is required to list periods.",
            },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          data: await service.listPeriods(companyId),
        });
      case "listTransactions":
        if (!companyId) {
          return NextResponse.json(
            {
              success: false,
              message: "companyId is required to list transactions.",
            },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          data: await service.listTransactions(companyId),
        });
      case "createPeriod": {
        const input = body.input ?? {};
        return NextResponse.json({
          success: true,
          data: await service.createPeriod({
            companyId: String(input.companyId ?? ""),
            year: Number(input.year),
            month: Number(input.month),
            startDate: String(input.startDate ?? ""),
            endDate: String(input.endDate ?? ""),
          }),
        });
      }
      case "createTransaction": {
        const input = body.input ?? {};
        return NextResponse.json({
          success: true,
          data: await service.createTransaction({
            companyId: String(input.companyId ?? ""),
            reference: String(input.reference ?? ""),
            transactionDate: String(input.transactionDate ?? ""),
            description: String(input.description ?? ""),
            transactionType: input.transactionType as never,
            amount:
              input.amount == null || input.amount === ""
                ? null
                : Number(input.amount),
            currency:
              typeof input.currency === "string" ? input.currency : undefined,
            createdByProfileId: access.profileId,
          }),
        });
      }
      case "postTransaction": {
        const input = body.input ?? {};
        const transactionId = String(input.transactionId ?? body.id ?? "");
        const existingTx = await service.getTransaction(transactionId);
        if (!existingTx) {
          return NextResponse.json(
            { success: false, message: "Financial transaction not found." },
            { status: 400 }
          );
        }
        await requirePlatformFinanceAccess({
          capability: PLATFORM_FINANCE_CAPABILITIES.post,
          companyId: existingTx.companyId,
        });
        return NextResponse.json({
          success: true,
          data: await service.postTransaction({
            transactionId,
            actorProfileId: access.profileId,
            lines: (Array.isArray(input.lines) ? input.lines : []) as never,
            periodId:
              typeof input.periodId === "string" ? input.periodId : null,
            reason: typeof input.reason === "string" ? input.reason : null,
          }),
        });
      }
      case "closePeriod": {
        const input = body.input ?? {};
        const periodId = String(input.periodId ?? body.id ?? "");
        const period = await service.getPeriod(periodId);
        if (!period) {
          return NextResponse.json(
            { success: false, message: "Period not found." },
            { status: 400 }
          );
        }
        await requirePlatformFinanceAccess({
          capability: PLATFORM_FINANCE_CAPABILITIES.manage_periods,
          companyId: period.companyId,
        });
        return NextResponse.json({
          success: true,
          data: await service.closePeriod({
            periodId,
            actorProfileId: access.profileId,
            reason: typeof input.reason === "string" ? input.reason : null,
          }),
        });
      }
      case "getJournal": {
        const journalId = String(body.id ?? "");
        const journal = await service.getJournal(journalId);
        await requirePlatformFinanceAccess({
          capability: PLATFORM_FINANCE_CAPABILITIES.view,
          companyId: journal.entry.companyId,
        });
        return NextResponse.json({
          success: true,
          data: journal,
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
