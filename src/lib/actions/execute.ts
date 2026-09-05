import { resolveActionContext } from "./context";
import { ActionError } from "./errors";
import {
  actionFailureFromError,
  actionSuccess,
  type ActionResult,
} from "./result";
import type { ActionDefinition } from "./types";
import { authorizeProtectedAction } from "@/lib/access/authorizeProtectedAction";
import { ProtectedActionError } from "@/lib/access/authorizeProtectedAction";
import { accessCan } from "@/lib/access";
import { isProtectedActionId } from "@/lib/access/protectedActions";

/**
 * Execute a platform action through the controlled boundary:
 * intent → auth/context → module check → (optional capability) →
 * (optional protected authority + FM step-up) → handler → result
 *
 * Does NOT auto-emit operational events — handlers call emitActionEvent explicitly.
 */
export async function executeAction<TInput, TData>(
  definition: ActionDefinition<TInput, TData>
): Promise<ActionResult<TData>> {
  try {
    if (!definition.name?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "Action name is required.");
    }

    if (!definition.module?.trim()) {
      throw new ActionError("VALIDATION_ERROR", "Action module is required.");
    }

    const context = await resolveActionContext({
      module: definition.module,
      departmentId: definition.departmentId,
    });

    const input = (definition.input ?? undefined) as TInput;

    if (definition.requiredCapability) {
      if (
        !context.operatingAccess ||
        !accessCan(context.operatingAccess, definition.requiredCapability)
      ) {
        throw new ActionError(
          "FORBIDDEN",
          `Missing capability: ${definition.requiredCapability}`
        );
      }
    }

    const protectedId =
      definition.protectedActionId ??
      (definition.protected && isProtectedActionId(definition.name)
        ? definition.name
        : null);

    if (definition.protected || protectedId) {
      if (!protectedId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Protected action id is required."
        );
      }
      const stepUpPassword = definition.getStepUpPassword?.(input) ?? null;
      try {
        const auth = await authorizeProtectedAction({
          actionId: protectedId,
          stepUpPassword,
        });
        context.protectedAuthority = auth.authority;
        // Prefer freshly authorized access (includes SA merge).
        context.operatingAccess = auth.access;
      } catch (error) {
        if (error instanceof ProtectedActionError) {
          throw new ActionError(
            error.code === "UNAUTHENTICATED" ||
              error.code === "STEP_UP_REQUIRED" ||
              error.code === "STEP_UP_FAILED"
              ? "UNAUTHENTICATED"
              : "FORBIDDEN",
            error.message,
            { details: { code: error.code } }
          );
        }
        throw error;
      }
    }

    const data = await definition.handler(context, input);
    return actionSuccess(data);
  } catch (error) {
    const failure = actionFailureFromError(error);
    const input =
      definition.input && typeof definition.input === "object"
        ? (definition.input as Record<string, unknown>)
        : null;
    console.error(`[executeAction:${definition.name}]`, {
      code: failure.error.code,
      message: failure.error.message,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      requestId:
        typeof input?.requestId === "string" ? input.requestId : undefined,
      maintenanceId:
        typeof input?.maintenanceId === "string"
          ? input.maintenanceId
          : undefined,
      incidentId:
        typeof input?.incidentId === "string" ? input.incidentId : undefined,
    });
    return failure;
  }
}
