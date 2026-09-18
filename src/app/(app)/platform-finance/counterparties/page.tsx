import type { Metadata } from "next";
import { PlatformFinanceCounterpartiesPage } from "@/modules/platform-finance/components/PlatformFinanceCounterpartiesPage";

export const metadata: Metadata = { title: "Counterparties" };

export default function PlatformFinanceCounterpartiesRoute() {
  return <PlatformFinanceCounterpartiesPage />;
}
