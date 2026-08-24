import { ActionError, isActionError, toActionError } from "./errors";
import type { ActionErrorCode } from "./errors";

export type ActionSuccess<TData> = {
  success: true;
  data: TData;
};

export type ActionFailure = {
  success: false;
  error: {
    code: ActionErrorCode;
    message: string;
  };
};

export type ActionResult<TData> = ActionSuccess<TData> | ActionFailure;

export function actionSuccess<TData>(data: TData): ActionSuccess<TData> {
  return { success: true, data };
}

export function actionFailure(
  code: ActionErrorCode,
  message?: string
): ActionFailure {
  const err = new ActionError(code, message);
  return {
    success: false,
    error: {
      code: err.code,
      message: err.message,
    },
  };
}

export function actionFailureFromError(error: unknown): ActionFailure {
  const err = toActionError(error);
  return {
    success: false,
    error: {
      code: err.code,
      message: err.message,
    },
  };
}

export function assertActionSuccess<TData>(
  result: ActionResult<TData>
): asserts result is ActionSuccess<TData> {
  if (!result.success) {
    throw new ActionError(result.error.code, result.error.message);
  }
}

export { isActionError };
