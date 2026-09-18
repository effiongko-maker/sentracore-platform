import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { requirePlatformAdmin } from "@/modules/platform-admin/server/requirePlatformAdmin";
import { PlatformAdminServerService } from "@/modules/platform-admin/server/PlatformAdminServerService";

type PlatformAdminAction =
  | "listOrganisations"
  | "listIdentities"
  | "inviteAndAttachUser"
  | "attachProfileToOrganisation"
  | "setProfileStatus"
  | "setOrganisationModule"
  | "grantPlatformCapability"
  | "revokePlatformCapability"
  | "offboardUser";

type RequestBody = {
  action?: PlatformAdminAction;
  organisationId?: string;
  profileId?: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  moduleSlug?: string;
  capability?: string;
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
      {
        success: false,
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
      { status: actionErrorStatus(error.code) }
    );
  }
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Platform admin request failed.";
  return NextResponse.json({ success: false, message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const action = body.action;
    if (!action) {
      return NextResponse.json(
        { success: false, message: "action is required." },
        { status: 400 }
      );
    }

    const service = new PlatformAdminServerService();

    switch (action) {
      case "listOrganisations": {
        const data = await service.listOrganisations(ctx);
        return NextResponse.json({ success: true, data });
      }
      case "listIdentities": {
        const data = await service.listIdentities(ctx, body.organisationId);
        return NextResponse.json({ success: true, data });
      }
      case "inviteAndAttachUser": {
        if (!body.email || !body.fullName || !body.organisationId) {
          return NextResponse.json(
            {
              success: false,
              message: "email, fullName, and organisationId are required.",
            },
            { status: 400 }
          );
        }
        const origin = new URL(request.url).origin;
        const data = await service.inviteAndAttachUser(ctx, {
          email: body.email,
          fullName: body.fullName,
          organisationId: body.organisationId,
          firstName: body.firstName,
          lastName: body.lastName,
          redirectOrigin: origin,
        });
        return NextResponse.json({ success: true, data });
      }
      case "attachProfileToOrganisation": {
        if (!body.email || !body.organisationId) {
          return NextResponse.json(
            {
              success: false,
              message: "email and organisationId are required.",
            },
            { status: 400 }
          );
        }
        const data = await service.attachProfileToOrganisation(ctx, {
          email: body.email,
          organisationId: body.organisationId,
        });
        return NextResponse.json({ success: true, data });
      }
      case "setProfileStatus": {
        if (!body.profileId || !body.status) {
          return NextResponse.json(
            { success: false, message: "profileId and status are required." },
            { status: 400 }
          );
        }
        const data = await service.setProfileStatus(ctx, {
          profileId: body.profileId,
          status: body.status,
        });
        return NextResponse.json({ success: true, data });
      }
      case "setOrganisationModule": {
        if (!body.organisationId || !body.moduleSlug || !body.status) {
          return NextResponse.json(
            {
              success: false,
              message: "organisationId, moduleSlug, and status are required.",
            },
            { status: 400 }
          );
        }
        if (body.status !== "enabled" && body.status !== "disabled") {
          return NextResponse.json(
            { success: false, message: "status must be enabled or disabled." },
            { status: 400 }
          );
        }
        const data = await service.setOrganisationModule(ctx, {
          organisationId: body.organisationId,
          moduleSlug: body.moduleSlug,
          status: body.status,
        });
        return NextResponse.json({ success: true, data });
      }
      case "grantPlatformCapability":
      case "revokePlatformCapability": {
        if (!body.organisationId || !body.profileId || !body.capability) {
          return NextResponse.json(
            {
              success: false,
              message: "organisationId, profileId, and capability are required.",
            },
            { status: 400 }
          );
        }
        const data =
          action === "grantPlatformCapability"
            ? await service.grantPlatformCapability(ctx, {
                organisationId: body.organisationId,
                profileId: body.profileId,
                capability: body.capability,
              })
            : await service.revokePlatformCapability(ctx, {
                organisationId: body.organisationId,
                profileId: body.profileId,
                capability: body.capability,
              });
        return NextResponse.json({ success: true, data });
      }
      case "offboardUser": {
        if (!body.profileId) {
          return NextResponse.json(
            { success: false, message: "profileId is required." },
            { status: 400 }
          );
        }
        const data = await service.offboardUser(ctx, {
          profileId: body.profileId,
        });
        return NextResponse.json({ success: true, data });
      }
      default:
        return NextResponse.json(
          { success: false, message: "Unknown action." },
          { status: 400 }
        );
    }
  } catch (error) {
    return errorResponse(error);
  }
}
