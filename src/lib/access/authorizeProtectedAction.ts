import "server-only";

import type { PlatformSession } from "@/lib/auth/types";
import {
  accessCan,
  resolveProtectedActionAuthority,
  type OperatingAccess,
  type ProtectedActionAuthority,
} from "./resolveAccess";
import {
  getProtectedActionDefinition,
  type ProtectedActionId,
} from "./protectedActions";
import { resolveOperatingAccess } from "./server";
import { getPlatformSession } from "@/lib/auth/session";
import { verifyFmStepUpPassword } from "./verifyFmStepUp";

export class ProtectedActionError extends Error {
  readonly status: number;
  readonly code:
    | "UNAUTHENTICATED"
    | "MISSING_CAPABILITY"
    | "PROTECTED_AUTHORITY_REQUIRED"
    | "STEP_UP_REQUIRED"
    | "STEP_UP_FAILED"
    | "FORBIDDEN";

  constructor(
    code: ProtectedActionError["code"],
    message: string,
    status = 403
  ) {
    super(message);
    this.name = "ProtectedActionError";
    this.code = code;
    this.status = status;
  }
}

export type AuthorizeProtectedActionInput = {
  actionId: ProtectedActionId;
  /** FM step-up password — required only for facility_manager authority. */
  stepUpPassword?: string | null;
};

export type AuthorizeProtectedActionResult = {
  session: PlatformSession;
  access: OperatingAccess;
  authority: ProtectedActionAuthority;
  actionId: ProtectedActionId;
};

/**
 * Authoritative protected-action gate:
 * base capability → resolveProtectedActionAuthority → FM step-up or SA override.
 */
export async function authorizeProtectedAction(
  input: AuthorizeProtectedActionInput
): Promise<AuthorizeProtectedActionResult> {
  const session = await getPlatformSession();
  if (!session) {
    throw new ProtectedActionError(
      "UNAUTHENTICATED",
      "You must be signed in to perform this action.",
      401
    );
  }

  const definition = getProtectedActionDefinition(input.actionId);
  const access = await resolveOperatingAccess(session);

  if (!accessCan(access, definition.baseCapability)) {
    throw new ProtectedActionError(
      "MISSING_CAPABILITY",
      `Missing capability: ${definition.baseCapability}`
    );
  }

  const authority = resolveProtectedActionAuthority(access);
  if (!authority) {
    throw new ProtectedActionError(
      "PROTECTED_AUTHORITY_REQUIRED",
      "This action requires Facility Manager authorization or System Administrator override."
    );
  }

  if (authority.mode === "facility_manager") {
    if (!input.stepUpPassword) {
      throw new ProtectedActionError(
        "STEP_UP_REQUIRED",
        "Facility Manager authorization is required for this protected action.",
        401
      );
    }
    const verified = await verifyFmStepUpPassword(input.stepUpPassword);
    if (!verified.ok) {
      throw new ProtectedActionError(
        "STEP_UP_FAILED",
        verified.reason === "missing"
          ? "Facility Manager authorization is required for this protected action."
          : "Facility Manager authorization failed. Check your password and try again.",
        401
      );
    }
  }
  // platform_override: no FM password

  return {
    session,
    access,
    authority,
    actionId: input.actionId,
  };
}
