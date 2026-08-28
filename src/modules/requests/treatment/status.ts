import type { RequestRecord, RequestStatus } from "../types";

/** Pure status helpers — safe for client and server. */

export const REQUEST_TERMINAL_STATUSES: RequestStatus[] = [
  "resolved",
  "closed",
  "cancelled",
];

export function isRequestTerminal(status: RequestStatus): boolean {
  return REQUEST_TERMINAL_STATUSES.includes(status);
}

/** Status after first successful create/link — never reopen terminal states. */
export function statusAfterTreatment(
  current: RequestStatus
): RequestStatus {
  if (isRequestTerminal(current)) return current;
  return "being_treated";
}

export function requestTreatableErrorMessage(
  request: RequestRecord
): string | null {
  if (!isRequestTerminal(request.status)) return null;
  return `Request ${request.id} is ${request.status} and cannot receive treatment.`;
}

export function requestResolvableErrorMessage(
  request: RequestRecord
): string | null {
  if (request.status === "cancelled") {
    return `Cancelled request ${request.id} cannot be resolved.`;
  }
  if (request.status === "closed") {
    return `Closed request ${request.id} is already closed.`;
  }
  if (request.status === "resolved") {
    return `Request ${request.id} is already resolved.`;
  }
  return null;
}

export function requestCancellableErrorMessage(
  request: RequestRecord
): string | null {
  if (request.status === "cancelled") {
    return `Request ${request.id} is already cancelled.`;
  }
  if (request.status === "closed") {
    return `Closed request ${request.id} cannot be cancelled.`;
  }
  return null;
}
