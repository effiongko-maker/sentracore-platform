import { ApiError } from "@/services/api/ApiResponse";
import {
  formatMonetaryFromNumber,
  parseMonetaryInput,
} from "./monetaryInput";

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
  const parsed = parseMonetaryInput(value);
  if (parsed !== undefined) return parsed;
  const cleaned = value.replace(/,/g, "").trim();
  return cleaned ? Number.NaN : 0;
}

export function formatAmountInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return formatMonetaryFromNumber(value);
}
