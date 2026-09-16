import type { Metadata } from "next";
import { PlatformFinancePayableDetailPage } from "@/modules/platform-finance/components/PlatformFinancePayableDetailPage";

export const metadata: Metadata = {
  title: "Payable",
};

export default function PlatformFinancePayableDetailRoute() {
  return <PlatformFinancePayableDetailPage />;
}
