import type { Metadata } from "next";
import { PlatformFinancePayablesPage } from "@/modules/platform-finance/components/PlatformFinancePayablesPage";

export const metadata: Metadata = {
  title: "Payables",
};

export default function PlatformFinancePayablesRoute() {
  return <PlatformFinancePayablesPage />;
}
