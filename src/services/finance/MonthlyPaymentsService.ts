export type MonthlyPaymentStatusTone = "neutral" | "info" | "warn" | "ok";

export type MonthlyContractPayment = {
  month?: string;
  /** Stable, URL-safe id derived from the month label only — never a source code/UUID. */
  slug?: string | null;
  requestedAmount?: number;
  amountReceived?: number;
  currency: string;
  /** Raw source text, verbatim — kept for detail-view transparency. */
  sourcePaymentStatus?: string;
  /** Concise operational label derived from sourcePaymentStatus. Never a fabricated workflow state. */
  status?: { label: string; tone: MonthlyPaymentStatusTone };
  /** No submission/request date exists in the source data today — always undefined. Never inferred. */
  submissionDate?: string;
  paymentDatetime?: string;
  commercialReference?: string;
};

export const MonthlyPaymentsService = {
  async list(): Promise<MonthlyContractPayment[]> {
    const response = await fetch("/api/finance/monthly-payments", { method: "POST", credentials: "same-origin" });
    const json = (await response.json()) as { success: boolean; data?: MonthlyContractPayment[]; message?: string };
    if (!response.ok || !json.success) throw new Error(json.message || "Unable to load monthly contract payments.");
    return json.data ?? [];
  },

  /**
   * Looks up a single record by its slug from the same (small, unpaginated) complete
   * list — no new server action. Returns null when the slug doesn't match any row,
   * never a fabricated placeholder record.
   */
  async getBySlug(slug: string): Promise<MonthlyContractPayment | null> {
    const rows = await MonthlyPaymentsService.list();
    return rows.find((row) => row.slug === slug) ?? null;
  },
};
