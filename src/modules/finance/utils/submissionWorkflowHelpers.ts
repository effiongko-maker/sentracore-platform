import { ApiError } from "@/services/api/ApiResponse";

export function submissionUserFacingError(error: unknown): string {
  if (error instanceof ApiError) {
    const message = error.message;
    if (/not found/i.test(message)) {
      return "This submission could not be found. It may have been removed.";
    }
    if (/Invalid CostSubmission/i.test(message)) {
      return message.replace(/^Invalid CostSubmission on \w+:\s*/i, "");
    }
    if (/network|fetch|timeout/i.test(message)) {
      return "Unable to reach SentraCore right now. Please try again.";
    }
    if (message.length < 200 && !/stack|undefined/i.test(message)) {
      return message;
    }
  }
  return "Something went wrong while saving this submission. Please try again.";
}

export function parseAmountInput(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function formatAmountInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}
