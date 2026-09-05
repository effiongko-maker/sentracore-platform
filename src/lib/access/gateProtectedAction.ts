import "server-only";

import { NextResponse } from "next/server";
import {
  recordSystemOperationalEvent,
} from "@/lib/events";
import {
  AuthorizeProtectedActionResult,
  authorizeProtectedAction,
  ProtectedActionError,
} from "./authorizeProtectedAction";
import {
  PROTECTED_PROOF_KEYS,
  getProtectedActionDefinition,
  isProtectedActionId,
  type ProtectedActionId,
} from "./protectedActions";

export type ProtectedProofExtraction = {
  actionId: ProtectedActionId | null;
  stepUpPassword: string | null;
  clientRequestId: string | null;
  /** Payload with password removed (safe to forward). */
  sanitizedPayload: Record<string, unknown>;
};

export function extractProtectedProof(
  payload: unknown
): ProtectedProofExtraction {
  const raw =
    payload && typeof payload === "object"
      ? ({ ...(payload as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const actionRaw = String(raw[PROTECTED_PROOF_KEYS.action] ?? "").trim();
  const actionId = isProtectedActionId(actionRaw) ? actionRaw : null;
  const stepUpPassword =
    raw[PROTECTED_PROOF_KEYS.stepUpPassword] != null
      ? String(raw[PROTECTED_PROOF_KEYS.stepUpPassword])
      : null;
  const clientRequestId =
    raw[PROTECTED_PROOF_KEYS.clientRequestId] != null
      ? String(raw[PROTECTED_PROOF_KEYS.clientRequestId])
      : null;

  delete raw[PROTECTED_PROOF_KEYS.stepUpPassword];

  return {
    actionId,
    stepUpPassword,
    clientRequestId,
    sanitizedPayload: raw,
  };
}

export function applyAuthorityToPayload(
  payload: Record<string, unknown>,
  result: AuthorizeProtectedActionResult
): Record<string, unknown> {
  return {
    ...payload,
    [PROTECTED_PROOF_KEYS.action]: result.actionId,
    [PROTECTED_PROOF_KEYS.authorityMode]: result.authority.mode,
    [PROTECTED_PROOF_KEYS.authorityLabel]: result.authority.label,
  };
}

export async function gateProtectedActionOrResponse(
  actionId: ProtectedActionId,
  stepUpPassword?: string | null
): Promise<
  | { ok: true; result: AuthorizeProtectedActionResult }
  | { ok: false; response: NextResponse }
> {
  try {
    const result = await authorizeProtectedAction({
      actionId,
      stepUpPassword,
    });
    return { ok: true, result };
  } catch (error) {
    if (error instanceof ProtectedActionError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            message: error.message,
            code: error.code,
            data: null,
          },
          { status: error.status }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message:
            error instanceof Error ? error.message : "Authorization failed",
          data: null,
        },
        { status: 401 }
      ),
    };
  }
}

export async function emitProtectedActionAudit(options: {
  auth: AuthorizeProtectedActionResult;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  clientRequestId?: string | null;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const definition = getProtectedActionDefinition(options.auth.actionId);
  const { access, authority, session } = options.auth;

  try {
    await recordSystemOperationalEvent({
      organisationId:
        session.organisation?.id ??
        session.profile.organisationId ??
        "",
      moduleId:
        session.enabledModules.find((m) => m.slug === "facility_management")
          ?.moduleId ??
        session.enabledModules[0]?.moduleId ??
        "facility_management",
      eventType: "facility.protected_action_authorized",
      entityType: definition.entityType,
      entityId: options.entityId,
      actorProfileId: session.profile.id,
      source: "user",
      data: {
        protectedActionId: options.auth.actionId,
        entityType: definition.entityType,
        entityId: options.entityId,
        actorEmail: session.email,
        operatingRole: access.role,
        operatingRoleLabel: access.roleLabel,
        platformRole: access.platformRole,
        isSuperAdmin: access.isSuperAdmin,
        authorityMode: authority.mode,
        authorityLabel: authority.label,
        clientRequestId: options.clientRequestId ?? null,
        before: options.before ?? null,
        after: options.after ?? null,
        ...options.extra,
      },
    });
  } catch (error) {
    console.error("[protected.audit] emit failed", {
      actionId: options.auth.actionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
