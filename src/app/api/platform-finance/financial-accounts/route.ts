import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { requirePlatformFinanceAccess } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceFinancialAccountsServerService } from "@/modules/platform-finance/server/PlatformFinanceFinancialAccountsServerService";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";

type Action =
  | "getContext"
  | "list"
  | "get"
  | "create"
  | "update"
  | "setStatus"
  | "grantAccess"
  | "revokeAccess";

type Body = {
  action?: Action;
  id?: string;
  companyId?: string;
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

    switch (action) {
      case "getContext":
        return NextResponse.json({
          success: true,
          data: await service.getContext(access.profileId),
        });
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
    }
  } catch (error) {
    return errorResponse(error);
  }
}
