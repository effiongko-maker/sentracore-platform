/**
 * Shared production helpers for ECC server mutations.
 */

export function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

/** User-facing copy when a morning/evening daily-ops slot is already filled. */
export function dailyOpsAlreadySubmittedMessage(
  period: "morning" | "evening" | "morning_or_evening" = "morning_or_evening"
): string {
  if (period === "morning") {
    return "The morning report for this centre and date has already been submitted.";
  }
  if (period === "evening") {
    return "The evening report for this centre and date has already been submitted.";
  }
  return "The morning or evening report for this centre and date has already been submitted.";
}

/** Map common Postgres unique-violation messages to stable API errors. */
export function mapUniqueViolation(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string
): Error {
  const message = error?.message?.trim() || fallback;
  const code = error?.code;
  if (code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    if (/ecc_daily_ops_period_day/i.test(message)) {
      return new Error(dailyOpsAlreadySubmittedMessage());
    }
    if (/ecc_attendance_open_person/i.test(message)) {
      return new Error("Agent is already signed in.");
    }
    if (/ecc_issues_source_section/i.test(message)) {
      return new Error(
        "An ECC Issue has already been raised for this daily ops section."
      );
    }
    if (/ecc_requests_source_section/i.test(message)) {
      return new Error(
        "An ECC Request has already been raised for this daily ops section."
      );
    }
    if (/ecc_shifts_one_current/i.test(message)) {
      return new Error(
        "Another current shift is already active. Retry setting the current shift."
      );
    }
    if (/ecc_finance_budgets_one_active/i.test(message)) {
      return new Error(
        "Another active budget already exists. Retry setting the budget."
      );
    }
    return new Error(fallback);
  }
  return new Error(message || fallback);
}

export function isDailyOpsPeriodUniqueViolation(
  error: unknown
): boolean {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  // Mapped application error (after throwDb / mapUniqueViolation).
  if (
    /already been submitted/i.test(message) &&
    /morning|evening/i.test(message) &&
    /centre and date/i.test(message)
  ) {
    return true;
  }
  // Raw Postgres unique violation on the period/day index.
  return (
    (code === "23505" || /duplicate key|unique constraint/i.test(message)) &&
    /ecc_daily_ops_period_day/i.test(message)
  );
}
