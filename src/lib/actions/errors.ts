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

function looksLikeSecret(message: string): boolean {
  return /service[_-]?role|api[_-]?key|authorization:\s*bearer|password|secret/i.test(
    message
  );
}

function safeMessageFromError(error: Error): string | undefined {
  const message = error.message?.trim();
  if (!message) return undefined;
  if (looksLikeSecret(message)) return undefined;
  // Cap length for toast safety.
  return message.length > 280 ? `${message.slice(0, 277)}…` : message;
}

function inferCodeFromMessage(message: string): ActionErrorCode {
  const lower = message.toLowerCase();
  if (lower.includes("unauthor") || lower.includes("not signed in")) {
    return "UNAUTHENTICATED";
  }
  if (lower.includes("module is not enabled") || lower.includes("module_not")) {
    return "MODULE_NOT_ENABLED";
  }
  if (lower.includes("forbidden") || lower.includes("do not have permission")) {
    return "FORBIDDEN";
  }
  if (
    lower.includes("not found") ||
    lower.includes("invalid") ||
    lower.includes("required") ||
    lower.includes("already linked") ||
    lower.includes("cannot be reassigned") ||
    lower.includes("terminal") ||
    lower.includes("cancelled") ||
    lower.includes("already resolved") ||
    lower.includes("lease") ||
    lower.includes("in progress")
  ) {
    return "VALIDATION_ERROR";
  }
  if (
    lower.includes("temporarily unavailable") ||
    lower.includes("fetch failed") ||
    lower.includes("econn") ||
    lower.includes("timeout") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("unable to reach")
  ) {
    return "INTERNAL_ERROR";
  }
  return "INTERNAL_ERROR";
}

function inferCodeFromHttpStatus(status: number): ActionErrorCode | undefined {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404 || status === 409 || status === 422 || status === 400) {
    return "VALIDATION_ERROR";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "INTERNAL_ERROR";
  }
  return undefined;
}

/**
 * Map unknown failures to a safe ActionError.
 * Preserves actionable Error/ApiError messages when they are not secret-bearing.
 */
export function toActionError(error: unknown): ActionError {
  if (isActionError(error)) return error;

  if (error instanceof Error) {
    const safe = safeMessageFromError(error);
    const status =
      "status" in error && typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : undefined;
    const code =
      (status != null ? inferCodeFromHttpStatus(status) : undefined) ??
      (safe ? inferCodeFromMessage(safe) : "INTERNAL_ERROR");

    // Prefer concrete safe messages for downstream/API failures.
    if (safe) {
      const message =
        status != null &&
        (status === 502 || status === 503 || status === 504) &&
        !/temporarily unavailable/i.test(safe)
          ? `${safe} (downstream temporarily unavailable)`
          : safe;
      return new ActionError(code, message, {
        details: status != null ? { status } : undefined,
        cause: error,
      });
    }

    return new ActionError(code, undefined, {
      details: status != null ? { status } : undefined,
      cause: error,
    });
  }

  return new ActionError("INTERNAL_ERROR", undefined, { cause: error });
}
