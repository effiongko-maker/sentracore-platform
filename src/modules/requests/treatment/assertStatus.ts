import { ActionError } from "@/lib/actions/errors";
import type { RequestRecord } from "../types";
import {
  requestCancellableErrorMessage,
  requestResolvableErrorMessage,
  requestTreatableErrorMessage,
} from "./status";

/**
 * Server-only assertions (throws ActionError).
 * Import from orchestration / server actions — not from client components.
 */

export function assertRequestTreatable(request: RequestRecord): void {
  const message = requestTreatableErrorMessage(request);
  if (message) throw new ActionError("VALIDATION_ERROR", message);
}

export function assertRequestResolvable(request: RequestRecord): void {
  const message = requestResolvableErrorMessage(request);
  if (message) throw new ActionError("VALIDATION_ERROR", message);
}

export function assertRequestCancellable(request: RequestRecord): void {
  const message = requestCancellableErrorMessage(request);
  if (message) throw new ActionError("VALIDATION_ERROR", message);
}
