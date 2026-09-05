import { NextResponse } from "next/server";
import { getOperatingAccess } from "@/lib/access/server";

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

  return NextResponse.json({
    success: true,
    status: 200,
    data: access,
  });
}
