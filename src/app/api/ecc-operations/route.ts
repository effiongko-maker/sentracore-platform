import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { requireEccAccess } from "@/modules/ecc-operations/server/requireEccAccess";
import { EccOperationsServerService } from "@/modules/ecc-operations/server/EccOperationsServerService";
import {
  hydrateEccLocalStateFromUnknown,
  type EccLocalState,
} from "@/modules/ecc-operations/store/eccLocalStore";

type EccAction =
  | "getFoundationStatus"
  | "getOverview"
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
  | "importLocalState"
  | "getPeopleSnapshot"
  | "createPerson"
  | "ensureCurrentShift"
  | "setCurrentShiftAssignments"
  | "signInPerson"
  | "signOutPerson";

type EccRequestBody = {
  action?: EccAction;
  centreId?: string;
  id?: string;
  input?: unknown;
  state?: unknown;
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
      : /already been raised|Cannot move/i.test(message)
        ? 400
        : 500;
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET() {
  try {
    const { organisationId } = await requireEccAccess();
    const service = new EccOperationsServerService(organisationId);
    const data = await service.getFoundationStatus();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { organisationId } = await requireEccAccess();
    const service = new EccOperationsServerService(organisationId);
    const body = (await request.json()) as EccRequestBody;
    const action = body.action;

    if (!action) {
      return NextResponse.json(
        { success: false, message: "Missing action." },
        { status: 400 }
      );
    }

    switch (action) {
      case "getFoundationStatus":
        return NextResponse.json({
          success: true,
          data: await service.getFoundationStatus(),
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
      case "importLocalState": {
        const state: EccLocalState = hydrateEccLocalStateFromUnknown(body.state);
        const data = await service.importLocalState(state);
        return NextResponse.json({ success: true, data });
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
