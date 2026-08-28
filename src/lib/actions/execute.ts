import { resolveActionContext } from "./context";
import { ActionError } from "./errors";
import {
  actionFailureFromError,
  actionSuccess,
  type ActionResult,
} from "./result";
import type { ActionDefinition } from "./types";

/**
 * Execute a platform action through the controlled boundary:
 * intent → auth/context → module check → (optional department) → handler → result
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
