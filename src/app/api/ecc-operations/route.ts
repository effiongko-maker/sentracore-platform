import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { toSessionIdentity } from "@/lib/auth/session";
import { requireEccAccess } from "@/modules/ecc-operations/server/requireEccAccess";
import { EccOperationsServerService } from "@/modules/ecc-operations/server/EccOperationsServerService";
import {
  capabilityForEccAction,
  ECC_RETIRED_ACTIONS,
} from "@/modules/ecc-operations/server/eccActionAuthority";
import { EccConflictError } from "@/modules/ecc-operations/server/validation";

type EccAction =
  | "getFoundationStatus"
  | "getOverview"
  | "getOperationalDate"
  | "listDailyOps"
  | "getDailyOps"
  | "createDailyOps"
  | "raiseIssueFromDailyOps"
  | "raiseRequestFromDailyOps"
  | "linkIssueAndRequest"
  | "listIssues"
  | "getIssue"
  | "createIssue"
  | "transitionIssue"
  | "appendIssueAction"
  | "deleteIssue"
  | "listRequests"
  | "getRequest"
  | "createRequest"
  | "transitionRequest"
  | "appendRequestAction"
  | "listReportingDimensions"
  | "getReportingSnapshot"
  | "getPeopleSnapshot"
  | "createPerson"
  | "setPersonActive"
  | "ensureCurrentShift"
  | "setCurrentShiftAssignments"
  | "signInPerson"
  | "signOutPerson"
  | "getFinanceSnapshot"
  | "setFinanceBudget"
  | "createFinanceTransaction"
  | "createFinanceCommitment"
  | "updateFinanceCommitmentStatus"
  | "listAuditEvents"
  | "getEntityAuditTrail";

type EccRequestBody = {
  action?: EccAction;
  centreId?: string;
  id?: string;
  entityType?: string;
  input?: unknown;
  state?: unknown;
  filter?: unknown;
};

function actionErrorStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (
    code === "MODULE_NOT_ENABLED" ||
    code === "FORBIDDEN" ||
    code === "DEPARTMENT_ACCESS_DENIED" ||
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
  if (error instanceof EccConflictError) {
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        message: error.message,
        existingId: error.existingId ?? null,
      },
      { status: 409 }
    );
  }
  if (isActionError(error)) {
    return NextResponse.json(
      { success: false, code: error.code, message: error.message },
      { status: actionErrorStatus(error.code) }
    );
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    "message" in error
  ) {
    const code = (error as { code: string }).code;
    const message = String((error as { message: unknown }).message ?? "");
    if (
      code === "UNAUTHENTICATED" ||
      code === "MODULE_NOT_ENABLED" ||
      code === "ORGANISATION_NOT_FOUND" ||
      code === "ORGANISATION_INACTIVE" ||
      code === "PROFILE_NOT_FOUND" ||
      code === "FORBIDDEN" ||
      code === "VALIDATION_ERROR" ||
      code === "DEPARTMENT_ACCESS_DENIED" ||
      code === "INTERNAL_ERROR"
    ) {
      return NextResponse.json(
        { success: false, code, message },
        { status: actionErrorStatus(code) }
      );
    }
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "ECC Operations request failed.";
  const status =
    /not found/i.test(message)
      ? 404
      : /already been raised|already exists|already signed|already been submitted|Cannot move|is required|Resolution notes/i.test(
            message
          )
        ? 400
        : 500;
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET() {
  try {
    const { session, organisationId } = await requireEccAccess();
    const identity = toSessionIdentity(session);
    const service = new EccOperationsServerService(organisationId, {
      userId: session.userId,
      email: session.email,
      name: identity.name,
    });
    const data = await service.getFoundationStatus();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: EccRequestBody;
    try {
      body = (await request.json()) as EccRequestBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 }
      );
    }
    const action = body.action;

    if (!action) {
      return NextResponse.json(
        { success: false, message: "Missing action." },
        { status: 400 }
      );
    }
    if (ECC_RETIRED_ACTIONS.includes(String(action))) {
      return NextResponse.json(
        {
          success: false,
          message: "This action has been retired. ECC records are created on the server.",
        },
        { status: 410 }
      );
    }

    // Per-action authority: view AND the action's own capability (unknown ⇒ refused).
    const capability = capabilityForEccAction(String(action));
    if (!capability) {
      return NextResponse.json(
        { success: false, message: `Unknown action: ${String(action)}` },
        { status: 400 }
      );
    }
    const { session, organisationId } = await requireEccAccess({ capability });
    const identity = toSessionIdentity(session);
    const service = new EccOperationsServerService(
      organisationId,
      {
        userId: session.userId,
        email: session.email,
        name: identity.name,
      },
      // Organisation timezone comes from the already-loaded session — no extra query.
      session.organisation?.timezone ?? null
    );

    switch (action) {
      case "getFoundationStatus":
        return NextResponse.json({
          success: true,
          data: await service.getFoundationStatus(),
        });
      case "getOperationalDate":
        return NextResponse.json({
          success: true,
          data: await service.getOperationalDate(),
        });
      case "getOverview":
        return NextResponse.json({
          success: true,
          data: await service.getOverview(body.centreId),
        });
      case "listDailyOps":
        return NextResponse.json({
          success: true,
          data: await service.listDailyOps(body.centreId),
        });
      case "getDailyOps":
        return NextResponse.json({
          success: true,
          data: await service.getDailyOps(String(body.id ?? "")),
        });
      case "createDailyOps":
        return NextResponse.json({
          success: true,
          data: await service.createDailyOps(body.input as never),
        });
      case "raiseIssueFromDailyOps":
        return NextResponse.json({
          success: true,
          data: await service.raiseIssueFromDailyOps(body.input as never),
        });
      case "raiseRequestFromDailyOps":
        return NextResponse.json({
          success: true,
          data: await service.raiseRequestFromDailyOps(body.input as never),
        });
      case "linkIssueAndRequest":
        return NextResponse.json({
          success: true,
          data: await service.linkIssueAndRequest(body.input as never),
        });
      case "listIssues":
        return NextResponse.json({
          success: true,
          data: await service.listIssues(body.centreId),
        });
      case "getIssue":
        return NextResponse.json({
          success: true,
          data: await service.getIssue(String(body.id ?? "")),
        });
      case "createIssue":
        return NextResponse.json({
          success: true,
          data: await service.createIssue(body.input as never),
        });
      case "transitionIssue":
        return NextResponse.json({
          success: true,
          data: await service.transitionIssue(body.input as never),
        });
      case "appendIssueAction":
        return NextResponse.json({
          success: true,
          data: await service.appendIssueAction(body.input as never),
        });
      case "deleteIssue":
        await service.deleteIssue(String(body.id ?? ""));
        return NextResponse.json({ success: true, data: null });
      case "listRequests":
        return NextResponse.json({
          success: true,
          data: await service.listRequests(body.centreId),
        });
      case "getRequest":
        return NextResponse.json({
          success: true,
          data: await service.getRequest(String(body.id ?? "")),
        });
      case "createRequest":
        return NextResponse.json({
          success: true,
          data: await service.createRequest(body.input as never),
        });
      case "transitionRequest":
        return NextResponse.json({
          success: true,
          data: await service.transitionRequest(body.input as never),
        });
      case "appendRequestAction":
        return NextResponse.json({
          success: true,
          data: await service.appendRequestAction(body.input as never),
        });
      case "listReportingDimensions":
        return NextResponse.json({
          success: true,
          data: await service.listReportingDimensions(),
        });
      case "getReportingSnapshot":
        return NextResponse.json({
          success: true,
          data: await service.getReportingSnapshot(body.centreId),
        });
      case "getPeopleSnapshot":
        return NextResponse.json({
          success: true,
          data: await service.getPeopleSnapshot(body.centreId),
        });
      case "createPerson":
        return NextResponse.json({
          success: true,
          data: await service.createPerson(body.input as never),
        });
      case "setPersonActive":
        return NextResponse.json({
          success: true,
          data: await service.setPersonActive(body.input as never),
        });
      case "ensureCurrentShift":
        return NextResponse.json({
          success: true,
          data: await service.ensureCurrentShift(body.input as never),
        });
      case "setCurrentShiftAssignments":
        return NextResponse.json({
          success: true,
          data: await service.setCurrentShiftAssignments(body.input as never),
        });
      case "signInPerson":
        return NextResponse.json({
          success: true,
          data: await service.signInPerson(body.input as never),
        });
      case "signOutPerson":
        return NextResponse.json({
          success: true,
          data: await service.signOutPerson(body.input as never),
        });
      case "getFinanceSnapshot":
        return NextResponse.json({
          success: true,
          data: await service.getFinanceSnapshot(body.centreId),
        });
      case "setFinanceBudget":
        return NextResponse.json({
          success: true,
          data: await service.setFinanceBudget(body.input as never),
        });
      case "createFinanceTransaction":
        return NextResponse.json({
          success: true,
          data: await service.createFinanceTransaction(body.input as never),
        });
      case "createFinanceCommitment":
        return NextResponse.json({
          success: true,
          data: await service.createFinanceCommitment(body.input as never),
        });
      case "updateFinanceCommitmentStatus":
        return NextResponse.json({
          success: true,
          data: await service.updateFinanceCommitmentStatus(body.input as never),
        });
      case "listAuditEvents":
        return NextResponse.json({
          success: true,
          data: await service.listAuditEvents(
            (body.filter as never) ?? (body.input as never) ?? {}
          ),
        });
      case "getEntityAuditTrail":
        return NextResponse.json({
          success: true,
          data: await service.getEntityAuditTrail(
            String(body.entityType ?? "") as never,
            String(body.id ?? "")
          ),
        });
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
