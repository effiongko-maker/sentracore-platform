import type { FinanceSettingsSnapshot } from "@/modules/platform-finance/settings";

export const PlatformFinanceSettingsService = {
  async get(): Promise<FinanceSettingsSnapshot> {
    const response = await fetch("/api/platform-finance/settings", { method: "POST", credentials: "same-origin" });
    const json = (await response.json().catch(() => null)) as
      | { success: true; data: FinanceSettingsSnapshot }
      | { success: false; message?: string }
      | null;
    if (!response.ok || !json || !json.success) {
      throw new Error((json && "message" in json && json.message) || "Unable to load Finance settings.");
    }
    return json.data;
  },
};
