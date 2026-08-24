import { resolveActionContext } from "./context";
import { ActionError, isActionError } from "./errors";
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
    if (process.env.NODE_ENV !== "production" && !isActionError(error)) {
      console.error(`[executeAction:${definition.name}]`, error);
    }
    return actionFailureFromError(error);
  }
}
