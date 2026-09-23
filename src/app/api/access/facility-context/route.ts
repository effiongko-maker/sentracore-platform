import { NextResponse } from "next/server";
import { getOperatingAccess } from "@/lib/access/server";
import { ALL_FACILITIES, FM_FACILITY_CONTEXT_COOKIE } from "@/lib/access/facilityScope";

/**
 * Set the signed-in user's workspace facility context ("all" or one authorised facility UUID).
 * Validated against CURRENT access here, and re-validated on every request by the access resolver — the cookie is a
 * preference only and can never widen scope.
 */
export async function POST(request: Request) {
  const access = await getOperatingAccess();
  if (!access) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  let selection = "";
  try {
    selection = String(((await request.json()) as { selection?: unknown }).selection ?? "").trim();
  } catch {
    selection = "";
  }
  const { options, allowAll } = access.workspaceFacility;
  const valid =
    (selection === ALL_FACILITIES && allowAll) || options.some((facility) => facility.id === selection);
  if (!valid) {
    return NextResponse.json(
      { success: false, message: "That facility is not in your authorised facility scope." },
      { status: 403 }
    );
  }
  const response = NextResponse.json({ success: true, data: { selection } });
  response.cookies.set(FM_FACILITY_CONTEXT_COOKIE, selection, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
