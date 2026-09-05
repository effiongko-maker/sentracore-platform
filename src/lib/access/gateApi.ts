import { NextResponse } from "next/server";
import type { PlatformSession } from "@/lib/auth/types";
import type { AccessCapability } from "./capabilities";
import {
  AccessDeniedError,
  requireCapability,
} from "./server";
import type { OperatingAccess } from "./resolveAccess";

export async function gateApiCapability(
  capability: AccessCapability
): Promise<
  | { ok: true; session: PlatformSession; access: OperatingAccess }
  | { ok: false; response: NextResponse }
> {
  try {
    const result = await requireCapability(capability);
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, message: error.message, data: null },
          { status: 403 }
        ),
      };
    }
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 401;
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message:
            error instanceof Error ? error.message : "Unauthorized",
          data: null,
        },
        { status: status === 403 ? 403 : 401 }
      ),
    };
  }
}
