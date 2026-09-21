import { NextResponse } from "next/server";
import { isActionError, type ActionErrorCode } from "@/lib/actions/errors";
import { requireOrganisationTimeZone } from "@/lib/time/organisationTime";
import { requireCommitmentsAccess } from "@/modules/command-centre/commitments/server/requireCommitmentsAccess";
import { ExecutiveCommitmentsService } from "@/modules/command-centre/commitments/server/ExecutiveCommitmentsService";

type Body = {
  action?: "listAssignees" | "create" | "update" | "complete" | "cancel";
  id?: string;
  input?: Record<string, unknown>;
};

function statusFor(code: ActionErrorCode | string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "VALIDATION_ERROR") return 400;
  if (
    code === "FORBIDDEN" ||
    code === "ORGANISATION_NOT_FOUND" ||
    code === "ORGANISATION_INACTIVE" ||
    code === "PROFILE_NOT_FOUND"
  ) {
    return 403;
  }
  return 500;
}

/**
 * Executive Commitments mutations. Every action is authorised server-side (session, active
 * profile, platform boundary, Command Centre view + commitments capability) before it runs;
 * the acting profile is always the authenticated session, never client input.
 */
export async function POST(request: Request) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
    }
    // Every action here is a manage-level action (assignee list included: it is only used to create/edit).
    const access = await requireCommitmentsAccess("manage");
    const service = new ExecutiveCommitmentsService(
      access.organisationId,
      access.profileId,
      requireOrganisationTimeZone(access.session.organisation)
    );
    switch (body.action) {
      case "listAssignees":
        return NextResponse.json({ success: true, data: await service.listAssignablePeople() });
      case "create":
        return NextResponse.json({ success: true, data: await service.create((body.input ?? {}) as never) });
      case "update":
        return NextResponse.json({ success: true, data: await service.update(body.id, (body.input ?? {}) as never) });
      case "complete":
        return NextResponse.json({ success: true, data: await service.complete(body.id) });
      case "cancel":
        return NextResponse.json({ success: true, data: await service.cancel(body.id) });
      default:
        return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    if (isActionError(error)) {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: statusFor(error.code) }
      );
    }
    return NextResponse.json({ success: false, message: "The request could not be completed." }, { status: 500 });
  }
}
