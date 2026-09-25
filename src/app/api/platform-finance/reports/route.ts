/**
 * Platform Finance — Reports API. Read-only.
 *
 * Every report is gated by the EXISTING capabilities that govern its source domain (see reports/catalogue.ts) plus
 * finance_company_access for the requested company. The service re-verifies both before reading anything.
 */
import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import {
  requirePlatformFinanceAccessAny,
  requirePlatformFinanceWorkspaceAccess,
} from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import { PlatformFinanceReportsServerService } from "@/modules/platform-finance/server/PlatformFinanceReportsServerService";
import { FINANCE_REPORTS, financeReportById } from "@/modules/platform-finance/reports/catalogue";
import type { FinanceReportParams } from "@/modules/platform-finance/reports/types";

type Action = "getCatalogue" | "listPeriods" | "runReport";
type Body = { action?: Action; reportId?: string; input?: Record<string, unknown> };

const ANY_REPORT_CAPABILITIES = [...new Set(FINANCE_REPORTS.flatMap((r) => r.capabilities))];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitize(message: string): string {
  const trimmed = message.trim();
  if (!trimmed || /service[_-]?role|apikey|bearer|password|secret/i.test(trimmed)) return "Report request failed.";
  return trimmed.slice(0, 400);
}

function errorResponse(error: unknown) {
  if (isActionError(error)) {
    const status =
      error.code === "UNAUTHENTICATED" ? 401
      : error.code === "VALIDATION_ERROR" ? 400
      : error.code === "INTERNAL_ERROR" ? 500
      : 403;
    return NextResponse.json({ success: false, code: error.code, message: sanitize(error.message) }, { status });
  }
  console.error("[platform-finance/reports]", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ success: false, message: "Report request failed." }, { status: 500 });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "getCatalogue": {
        // Any Finance grant may see which reports exist; opening one needs that report's own grant.
        const access = await requirePlatformFinanceWorkspaceAccess();
        const service = new PlatformFinanceReportsServerService(access.organisationId);
        return NextResponse.json({ success: true, data: await service.getCatalogue(access) });
      }
      case "listPeriods": {
        const companyId = text(body.input?.companyId);
        if (!companyId) return NextResponse.json({ success: false, message: "Company is required." }, { status: 400 });
        const access = await requirePlatformFinanceAccessAny({ capabilities: ANY_REPORT_CAPABILITIES, companyId });
        const service = new PlatformFinanceReportsServerService(access.organisationId);
        return NextResponse.json({ success: true, data: await service.listPeriods(access, companyId) });
      }
      case "runReport": {
        const report = financeReportById(String(body.reportId ?? ""));
        if (!report) return NextResponse.json({ success: false, message: "Unknown report." }, { status: 404 });
        const input = body.input ?? {};
        const params: FinanceReportParams = {
          companyId: text(input.companyId) ?? "",
          periodId: text(input.periodId),
          fromPeriodId: text(input.fromPeriodId),
          toPeriodId: text(input.toPeriodId),
          scope: input.scope === "ytd" ? "ytd" : "period",
          comparison: input.comparison === "prior_period" || input.comparison === "prior_year" ? input.comparison : "none",
          accountId: text(input.accountId),
          from: text(input.from),
          to: text(input.to),
        };
        if (!params.companyId) return NextResponse.json({ success: false, message: "Company is required." }, { status: 400 });
        const access = await requirePlatformFinanceAccessAny({ capabilities: report.capabilities, companyId: params.companyId });
        const service = new PlatformFinanceReportsServerService(access.organisationId);
        return NextResponse.json({ success: true, data: await service.run(access, report.id, params) });
      }
      default:
        return NextResponse.json({ success: false, message: "Unknown report action." }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
