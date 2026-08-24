import { NextResponse } from "next/server";
import {
  getPlatformSession,
  toSessionIdentity,
} from "@/lib/auth/session";

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

  return NextResponse.json({
    success: true,
    status: 200,
    data: {
      identity: toSessionIdentity(session),
      organisation: session.organisation,
      roleSlugs: session.roleSlugs,
      roleAssignments: session.roleAssignments,
      enabledModules: session.enabledModules,
      profile: session.profile,
    },
  });
}
