export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "PROFILE_NOT_FOUND"
  | "ORGANISATION_NOT_FOUND"
  | "ORGANISATION_INACTIVE"
  | "MODULE_NOT_ENABLED"
  | "DEPARTMENT_ACCESS_DENIED"
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "INTERNAL_ERROR";

const CLIENT_MESSAGES: Record<ActionErrorCode, string> = {
  UNAUTHENTICATED: "You must be signed in to perform this action.",
  PROFILE_NOT_FOUND: "Your profile could not be found.",
  ORGANISATION_NOT_FOUND: "No organisation is associated with your account.",
  ORGANISATION_INACTIVE: "Your organisation is not active.",
  MODULE_NOT_ENABLED: "This module is not enabled for your organisation.",
  DEPARTMENT_ACCESS_DENIED: "You do not have access to this department.",
  VALIDATION_ERROR: "The request could not be validated.",
  FORBIDDEN: "You do not have permission to perform this action.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
};

/**
 * Typed action failure. Safe for API/UI surfaces — no internal details in message.
 */
export class ActionError extends Error {
  readonly code: ActionErrorCode;
  readonly details?: unknown;

  constructor(
    code: ActionErrorCode,
    message?: string,
    options?: { details?: unknown; cause?: unknown }
  ) {
    super(message ?? CLIENT_MESSAGES[code]);
    this.name = "ActionError";
    this.code = code;
    this.details = options?.details;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isActionError(value: unknown): value is ActionError {
  return value instanceof ActionError;
}

/** Map unknown failures to a safe ActionError (no stack/SQL leakage). */
export function toActionError(error: unknown): ActionError {
  if (isActionError(error)) return error;
  return new ActionError("INTERNAL_ERROR", undefined, { cause: error });
}
