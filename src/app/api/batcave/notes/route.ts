import { NextResponse } from "next/server";
import { isActionError } from "@/lib/actions/errors";
import { requireBatcaveAccess } from "@/modules/batcave/server/requireBatcaveAccess";
import { BatcaveNotesService } from "@/modules/batcave/notes/server/BatcaveNotesService";

type Body = { action?: "create" | "update" | "delete"; id?: string; input?: { title?: unknown; body?: unknown } };

/**
 * Private notes mutations. Authorised server-side (Command Centre gate + explicit Batcave grant)
 * before any action. Only `title` and `body` are read from the client — owner and organisation
 * always come from the authenticated session. Unauthorised callers get a plain 404.
 */
export async function POST(request: Request) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
    }
    const access = await requireBatcaveAccess();
    const service = new BatcaveNotesService(access);
    const input = { title: body.input?.title, body: body.input?.body };
    switch (body.action) {
      case "create":
        return NextResponse.json({ success: true, data: await service.create(input) });
      case "update":
        return NextResponse.json({ success: true, data: await service.update(body.id, input) });
      case "delete":
        await service.remove(body.id);
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    if (isActionError(error)) {
      if (error.code === "UNAUTHENTICATED") return NextResponse.json({ success: false }, { status: 401 });
      if (error.code === "VALIDATION_ERROR") return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      if (error.code === "FORBIDDEN" || error.code === "PROFILE_NOT_FOUND" || error.code === "ORGANISATION_NOT_FOUND" || error.code === "ORGANISATION_INACTIVE") {
        return NextResponse.json({ success: false }, { status: 404 });
      }
    }
    return NextResponse.json({ success: false, message: "The request could not be completed." }, { status: 500 });
  }
}
