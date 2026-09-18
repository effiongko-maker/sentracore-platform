import type { FinanceReceivable } from "@/modules/platform-finance/domain/receivables";

const API_PATH = "/api/platform-finance/receivables";
async function action<T>(name: string, id?: string): Promise<T> {
  const response = await fetch(API_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, id }) });
  const json = await response.json() as { success: boolean; data?: T; message?: string };
  if (!response.ok || !json.success) throw new Error(json.message ?? "Receivable request failed.");
  return json.data as T;
}
export const PlatformFinanceReceivablesService = {
  list: () => action<FinanceReceivable[]>("listReceivables"),
  get: (id: string) => action<FinanceReceivable>("getReceivable", id),
};
