import type { Metadata } from "next";
import { PlatformFinanceSettingsPage } from "@/modules/platform-finance/components/PlatformFinanceSettingsPage";

export const metadata: Metadata = { title: "Finance Settings" };

export default function PlatformFinanceSettingsRoute() {
  return <PlatformFinanceSettingsPage />;
}
