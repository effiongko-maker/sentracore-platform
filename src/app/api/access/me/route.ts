import { NextResponse } from "next/server";
import { getOperatingAccess } from "@/lib/access/server";
import { getPlatformSession } from "@/lib/auth/session";

/**
 * Authoritative operating-role + capability context for the signed-in user.
 * Role comes from People register (sheet) matched by session email.
 */
export async function GET() {
  const access = await getOperatingAccess();

  if (!access) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  // The organisation's authoritative IANA timezone (organisations.timezone), for organisation-local date logic
  // (e.g. report periods). null when it cannot be read — never a guess, never the browser's timezone.
  const session = await getPlatformSession();
  const timeZone = session?.organisation?.timezone?.trim() || null;

  return NextResponse.json({
    success: true,
    status: 200,
    data: access,
    organisationTimeZone: timeZone,
  });
}
