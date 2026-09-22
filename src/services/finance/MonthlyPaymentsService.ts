export type MonthlyContractPayment = {
  month?: string;
  requestedAmount?: number;
  amountReceived?: number;
  currency: string;
  sourcePaymentStatus?: string;
  paymentDatetime?: string;
};

export const MonthlyPaymentsService = {
  async list(): Promise<MonthlyContractPayment[]> {
    const response = await fetch("/api/finance/monthly-payments", { method: "POST", credentials: "same-origin" });
    const json = (await response.json()) as { success: boolean; data?: MonthlyContractPayment[]; message?: string };
    if (!response.ok || !json.success) throw new Error(json.message || "Unable to load monthly contract payments.");
    return json.data ?? [];
  },
};
