import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { requirePlatformFinanceAccess } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceFinancialAccountsServerService } from "@/modules/platform-finance/server/PlatformFinanceFinancialAccountsServerService";
import { PlatformFinanceOpeningPositionsServerService } from "@/modules/platform-finance/server/PlatformFinanceOpeningPositionsServerService";
import { PlatformFinanceServerService } from "@/modules/platform-finance/server/PlatformFinanceServerService";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";

type Action =
  | "getContext"
  | "list"
  | "get"
  | "create"
  | "update"
  | "setStatus"
  | "grantAccess"
  | "revokeAccess"
  | "listOpeningPositions"
  | "getOpeningPositionReview"
  | "updateOpeningPositionDraft"
  | "postOpeningPosition";

type Body = {
  action?: Action;
  id?: string;
  companyId?: string;
  financialAccountId?: string;
  input?: Record<string, unknown>;
};

function errorResponse(error: unknown) {
  if (isActionError(error)) {
    const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "VALIDATION_ERROR" ? 400 : 403;
    return NextResponse.json(
      { success: false, code: error.code, message: error.message },
      { status }
    );
  }
  return NextResponse.json(
    { success: false, message: "Financial Account request failed." },
    { status: 500 }
  );
}

function accountInput(input: Record<string, unknown>) {
  return {
    companyId: String(input.companyId ?? ""),
    accountType: input.accountType,
    name: String(input.name ?? ""),
    institutionName:
      typeof input.institutionName === "string" ? input.institutionName : null,
    accountNumberLast4:
      typeof input.accountNumberLast4 === "string"
        ? input.accountNumberLast4
        : null,
    currency: String(input.currency ?? "NGN"),
    controlGlAccountId: String(input.controlGlAccountId ?? ""),
    visibilityPolicy: input.visibilityPolicy,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const action = body.action;
    if (!action) {
      return NextResponse.json(
        { success: false, message: "Missing action." },
        { status: 400 }
      );
    }

    const manage = [
      "create",
      "update",
      "setStatus",
      "grantAccess",
      "revokeAccess",
    ].includes(action);
    const input = body.input ?? {};
    const companyId =
      action === "create" ? String(input.companyId ?? body.companyId ?? "") : undefined;
    const access = await requirePlatformFinanceAccess({
      capability: manage
        ? PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
        : PLATFORM_FINANCE_CAPABILITIES.financial_account_view,
      companyId: companyId || undefined,
    });
    const service = new PlatformFinanceFinancialAccountsServerService(
      access.organisationId
    );
    const openings = new PlatformFinanceOpeningPositionsServerService(
      access.organisationId
    );
    const actor = {
      organisationId: access.organisationId,
      profileId: access.profileId,
    };
    const financialAccountId = String(
      body.financialAccountId ??
        body.id ??
        input.financialAccountId ??
        ""
    );

    switch (action) {
      case "getContext": {
        const [context, accountingCaps] = await Promise.all([
          service.getContext(access.profileId),
          new PlatformFinanceServerService(
            access.organisationId
          ).getMyAccountingCapabilities(access.profileId),
        ]);
        return NextResponse.json({
          success: true,
          data: {
            ...context,
            canPrepareOpening: accountingCaps.createTransaction,
            canPostOpening: accountingCaps.post,
          },
        });
      }
      case "list":
        return NextResponse.json({
          success: true,
          data: await service.listVisible(
            access.profileId,
            typeof body.companyId === "string" ? body.companyId : null
          ),
        });
      case "get":
        return NextResponse.json({
          success: true,
          data: await service.getVisible(
            access.profileId,
            String(body.id ?? input.financialAccountId ?? "")
          ),
        });
      case "create":
        return NextResponse.json({
          success: true,
          data: await service.create(access.profileId, accountInput(input)),
        });
      case "update": {
        const status = input.status;
        if (status !== "active" && status !== "inactive") {
          return NextResponse.json(
            { success: false, message: "Invalid account status." },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          data: await service.update(
            access.profileId,
            String(body.id ?? input.financialAccountId ?? ""),
            { ...accountInput(input), status }
          ),
        });
      }
      case "setStatus": {
        const status = input.status;
        if (status !== "active" && status !== "inactive") {
          return NextResponse.json(
            { success: false, message: "Invalid account status." },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          data: await service.setStatus(
            access.profileId,
            String(body.id ?? input.financialAccountId ?? ""),
            status
          ),
        });
      }
      case "grantAccess":
        await service.grantAccess(
          access.profileId,
          String(body.id ?? input.financialAccountId ?? ""),
          String(input.profileId ?? "")
        );
        return NextResponse.json({ success: true, data: null });
      case "revokeAccess":
        await service.revokeAccess(
          access.profileId,
          String(body.id ?? input.financialAccountId ?? ""),
          String(input.profileId ?? "")
        );
        return NextResponse.json({ success: true, data: null });
      case "listOpeningPositions": {
        const rows = await service.listVisible(
          access.profileId,
          typeof body.companyId === "string" ? body.companyId : null
        );
        return NextResponse.json({
          success: true,
          data: await openings.listForVisibleAccounts(
            actor,
            rows.map((row) => row.id)
          ),
        });
      }
      case "getOpeningPositionReview":
        return NextResponse.json({
          success: true,
          data: await openings.getReview(actor, financialAccountId),
        });
      case "updateOpeningPositionDraft":
        return NextResponse.json({
          success: true,
          data: await openings.updateDraft(actor, financialAccountId, {
            amount: input.amount,
            cutoverDate:
              typeof input.cutoverDate === "string" ? input.cutoverDate : null,
          }),
        });
      case "postOpeningPosition":
        return NextResponse.json({
          success: true,
          data: await openings.post(actor, financialAccountId),
        });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
