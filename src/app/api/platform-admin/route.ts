import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { requirePlatformAdmin } from "@/modules/platform-admin/server/requirePlatformAdmin";
import { PlatformAdminServerService } from "@/modules/platform-admin/server/PlatformAdminServerService";
import { AUDIT_ACTIONS_BY_CATEGORY, type AuditCategory } from "@/modules/platform-admin/auditDescribe";

type PlatformAdminAction =
  | "listOrganisations"
  | "listIdentities"
  | "createAccount"
  | "issueTemporaryPassword"
  | "attachProfileToOrganisation"
  | "setProfileStatus"
  | "setAccessScope"
  | "setLandingWorkspace"
  | "setOrganisationModule"
  | "grantPlatformCapability"
  | "revokePlatformCapability"
  | "batchUpdateCapabilities"
  | "offboardUser"
  | "getOverview"
  | "listPeople"
  | "getPerson"
  | "listModules"
  | "listFacilities"
  | "listAudit"
  | "setFacilityAssignment";

type RequestBody = {
  action?: PlatformAdminAction;
  organisationId?: string;
  profileId?: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  accessScope?: string;
  homeModule?: string | null;
  landingWorkspace?: string | null;
  moduleSlug?: string;
  capability?: string;
  category?: string;
  before?: string;
  limit?: number;
  facilityId?: string;
  operationalRole?: string;
  assignmentId?: string;
  capabilityPackage?: string | null;
  capabilities?: string[];
  grantCapabilities?: string[];
  revokeCapabilities?: string[];
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
      case "createAccount": {
        if (!body.email || !body.fullName || !body.organisationId) {
          return NextResponse.json(
            { success: false, message: "email, fullName, and organisationId are required." },
            { status: 400 }
          );
        }
        const data = await service.createAccount(ctx, {
          email: body.email,
          fullName: body.fullName,
          firstName: body.firstName,
          lastName: body.lastName,
          organisationId: body.organisationId,
          accessScope: body.accessScope,
          homeModule: body.homeModule,
          landingWorkspace: body.landingWorkspace,
          facilityAssignment: body.facilityId ? { facilityId: body.facilityId, operationalRole: body.operationalRole } : null,
          capabilityPackage: body.capabilityPackage,
          capabilities: body.capabilities,
        });
        // The response carries a one-time credential: never cacheable, never logged.
        return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
      }
      case "issueTemporaryPassword": {
        if (!body.profileId) {
          return NextResponse.json({ success: false, message: "profileId is required." }, { status: 400 });
        }
        const data = await service.issueTemporaryPassword(ctx, { profileId: body.profileId });
        return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
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
      case "setAccessScope": {
        if (!body.profileId || !body.accessScope) {
          return NextResponse.json(
            { success: false, message: "profileId and accessScope are required." },
            { status: 400 }
          );
        }
        const data = await service.setAccessScope(ctx, {
          profileId: body.profileId,
          accessScope: body.accessScope,
          homeModule: body.homeModule ?? null,
        });
        return NextResponse.json({ success: true, data });
      }
      case "setLandingWorkspace": {
        if (!body.profileId) {
          return NextResponse.json(
            { success: false, message: "profileId is required." },
            { status: 400 }
          );
        }
        const data = await service.setLandingWorkspace(ctx, {
          profileId: body.profileId,
          landingWorkspace: body.landingWorkspace ?? null,
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
      case "batchUpdateCapabilities": {
        if (!body.organisationId || !body.profileId) {
          return NextResponse.json(
            {
              success: false,
              message: "organisationId and profileId are required.",
            },
            { status: 400 }
          );
        }
        const data = await service.batchUpdateCapabilities(ctx, {
          organisationId: body.organisationId,
          profileId: body.profileId,
          grant: body.grantCapabilities ?? [],
          revoke: body.revokeCapabilities ?? [],
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
      case "getOverview":
      case "listPeople":
      case "listModules":
      case "listFacilities":
      case "listAudit":
      case "getPerson": {
        if (!body.organisationId) {
          return NextResponse.json({ success: false, message: "organisationId is required." }, { status: 400 });
        }
        const reader = service.reader();
        if (action === "getOverview") return NextResponse.json({ success: true, data: await reader.overview(body.organisationId) });
        if (action === "listPeople") return NextResponse.json({ success: true, data: await reader.listPeople(body.organisationId) });
        if (action === "listFacilities") return NextResponse.json({ success: true, data: await reader.listFacilities(body.organisationId) });
        if (action === "listModules") return NextResponse.json({ success: true, data: await reader.listModules(body.organisationId) });
        if (action === "getPerson") {
          if (!body.profileId) return NextResponse.json({ success: false, message: "profileId is required." }, { status: 400 });
          return NextResponse.json({ success: true, data: await reader.getPerson(body.organisationId, body.profileId) });
        }
        const category = body.category && body.category in AUDIT_ACTIONS_BY_CATEGORY ? (body.category as AuditCategory) : undefined;
        if (body.category && !category) {
          return NextResponse.json({ success: false, message: "Unknown audit category." }, { status: 400 });
        }
        const data = await reader.listAudit({
          organisationId: body.organisationId,
          category,
          profileId: body.profileId,
          before: body.before,
          limit: body.limit,
        });
        return NextResponse.json({ success: true, data });
      }
      case "setFacilityAssignment": {
        if (!body.organisationId || !body.profileId || !body.operationalRole || (!body.facilityId && !body.assignmentId)) {
          return NextResponse.json(
            { success: false, message: "organisationId, profileId, operationalRole and facilityId are required." },
            { status: 400 }
          );
        }
        const data = await service.setFacilityAssignment(ctx, {
          organisationId: body.organisationId,
          profileId: body.profileId,
          facilityId: body.facilityId ?? "",
          operationalRole: body.operationalRole,
          status: body.status,
          assignmentId: body.assignmentId,
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
