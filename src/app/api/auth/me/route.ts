import { NextResponse } from "next/server";
import {
  getPlatformSession,
  toSessionIdentity,
} from "@/lib/auth/session";
import { resolveWorkspaceAccessChrome } from "@/lib/access/workspaceAccessChrome";
import { resolveOperatingAccess } from "@/lib/access/server";

/**
 * Returns the authenticated platform identity for client chrome.
 * Privileged fields (service role, bootstrap) are never included.
 */
export async function GET() {
  const session = await getPlatformSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const organisationId =
    session.organisation?.id ?? session.profile.organisationId ?? null;
  const operatingAccess = await resolveOperatingAccess(session);
  const workspaceAccess =
    organisationId && session.profile.id
      ? await resolveWorkspaceAccessChrome({
          organisationId,
          profileId: session.profile.id,
          roleSlugs: session.roleSlugs,
          enabledModules: session.enabledModules,
          operatingAccess,
        })
      : {
          facilityManagement: false,
          eccOperations: false,
          platformFinance: false,
          commandCentre: false,
        };

  return NextResponse.json({
    success: true,
    status: 200,
    data: {
      identity: toSessionIdentity(session),
      organisation: session.organisation,
      roleSlugs: session.roleSlugs,
      roleAssignments: session.roleAssignments,
      enabledModules: session.enabledModules,
      workspaceAccess,
      profile: session.profile,
    },
  });
}
